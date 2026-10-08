import {localClock,currentStay} from './schedule.mjs';
import {screenImages} from './media.mjs';
import {screenVideo} from './video.mjs';
export async function tokenHash(token){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
export function createHandler(admin,clock=()=>new Date()){
 return async req=>{
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Cache-Control':'no-store','Content-Type':'application/json'};
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method==='POST'){
   try{
    const raw=await req.text();if(raw.length>512)return reply({error:'Invalid pairing code'},400);
    const code=String(JSON.parse(raw).code||'').toUpperCase().replace(/[\s-]/g,'');
    if(!/^[0-9A-HJKMNP-TV-Z]{16}$/.test(code))return reply({error:'Invalid or expired pairing code'},401);
    const hash=await tokenHash(code);
    const credential=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');
    // One conditional SQL UPDATE consumes the code and rotates the unused credential.
    // Concurrent claims re-check the pairing_hash predicate after the row lock.
    const {data,error}=await admin.from('ts_display_devices').update({pairing_hash:null,pairing_expires_at:null,token_hash:await tokenHash(credential)}).eq('pairing_hash',hash).eq('revoked',false).gt('pairing_expires_at',clock().toISOString()).or(`expires_at.is.null,expires_at.gt.${clock().toISOString()}`).select('id');
    if(error)throw error;
    if(data.length!==1)return reply({error:'Invalid or expired pairing code'},401);
    return reply({token:credential});
   }catch{return reply({error:'Pairing unavailable. Check your code and try again.'},400);}
  }
  if(req.method!=='GET')return reply({error:'Method not allowed'},405);
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
  if(!/^[0-9a-f]{64}$/.test(token))return reply({error:'Screen connection unavailable'},401);
  try{
   const hash=await tokenHash(token);
   const {data:device,error}=await admin.from('ts_display_devices').select('owner_id,property_id').eq('token_hash',hash).eq('revoked',false).or(`expires_at.is.null,expires_at.gt.${clock().toISOString()}`).maybeSingle();
   if(error)throw error;
   if(!device)return reply({error:'Screen connection unavailable'},401);
   const [p,d]=await Promise.all([
    admin.from('ts_properties').select('name,check_in,check_out,timezone').eq('id',device.property_id).eq('owner_id',device.owner_id).single(),
    admin.from('ts_guest_displays').select('title,welcome,guidebook,recommendations,contact,personalize,house_rules,slideshow_seconds,music_enabled,music_default,music_volume').eq('property_id',device.property_id).eq('owner_id',device.owner_id).maybeSingle()
   ]);
   if(p.error||d.error)throw Error('Read failed');
   const display=d.data||{title:'Welcome, {{guest}}',welcome:'Make yourself at home.',guidebook:'',recommendations:'',contact:'',house_rules:'',slideshow_seconds:20};
   let guest='Guest',stay=null;
   if(display.personalize){
    const now=clock(),day=localClock(now,p.data.timezone).day;
    const bookings=await admin.from('ts_reservations').select('guest,arrival,departure,status').eq('property_id',device.property_id).eq('owner_id',device.owner_id).eq('status','confirmed').gte('departure',day).order('arrival',{ascending:true});
    if(bookings.error)throw Error('Booking read failed');
    const selected=currentStay(bookings.data,p.data,now);
    if(selected){guest=selected.guest;stay={arrival:selected.arrival,departure:selected.departure};}
   }
   const {name,check_in,check_out}=p.data;
   const {title,welcome,guidebook,recommendations,contact,house_rules='',slideshow_seconds=20,music_enabled=true,music_default='woodland',music_volume=15}=display;
   const [images,video]=await Promise.all([screenImages(admin,device),screenVideo(admin,device)]);
   return reply({property:{name,check_in,check_out},stay,display:{title:title.replaceAll('{{guest}}',guest),welcome,guidebook,recommendations,contact,house_rules,slideshow_seconds,music_enabled,music_default,music_volume,images,video}});
  }catch{return reply({error:'Display temporarily unavailable'},503);}
 };
}

