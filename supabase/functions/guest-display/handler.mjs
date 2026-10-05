export async function tokenHash(token){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
export function createHandler(admin){
 return async req=>{
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Allow-Methods':'GET, OPTIONS','Cache-Control':'no-store','Content-Type':'application/json'};
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='GET')return reply({error:'Method not allowed'},405);
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
  if(!/^[0-9a-f]{64}$/.test(token))return reply({error:'Screen connection unavailable'},401);
  try{
   const hash=await tokenHash(token);
   const {data:device,error}=await admin.from('ts_display_devices').select('owner_id,property_id').eq('token_hash',hash).eq('revoked',false).gt('expires_at',new Date().toISOString()).maybeSingle();
   if(error)throw error;
   if(!device)return reply({error:'Screen connection unavailable'},401);
   const [p,d]=await Promise.all([
    admin.from('ts_properties').select('name,check_in,check_out').eq('id',device.property_id).eq('owner_id',device.owner_id).single(),
    admin.from('ts_guest_displays').select('title,welcome,guidebook,recommendations,contact').eq('property_id',device.property_id).eq('owner_id',device.owner_id).maybeSingle()
   ]);
   if(p.error||d.error)throw Error('Read failed');
   return reply({property:p.data,display:d.data||{title:'Welcome, {{guest}}',welcome:'Make yourself at home.',guidebook:'',recommendations:'',contact:''}});
  }catch{return reply({error:'Display temporarily unavailable'},503);}
 };
}
