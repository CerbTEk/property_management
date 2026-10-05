import {savedPhoneCode} from './phone-code.mjs';
import {validDay} from './model.mjs';
// Reject missing and repeated wall-clock times rather than guess during DST changes.
export function localInstant(day,time,timezone){
 if(!validDay(day)||!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time))throw Error('Invalid access date or time.');
 const local=day+'T'+(time.length===5?time+':00':time);
 const nominal=Date.parse(local+'Z');
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const parts=ms=>Object.fromEntries(fmt.formatToParts(new Date(ms)).map(p=>[p.type,p.value]));
 const wall=ms=>{const p=parts(ms);return `${p.year.padStart(4,'0')}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;};
 const offsets=new Set();
 for(let hours=-36;hours<=36;hours+=6){const sample=nominal+hours*3600000;offsets.add(Date.parse(wall(sample)+'Z')-sample);}
 const matches=[...offsets].map(o=>nominal-o).filter(ms=>wall(ms)===local);
 if(matches.length!==1)throw Error('This local access time is missing or ambiguous because of a clock change. Adjust the listing time.');
 return matches[0];
}
export function guestAccessPlan(property,booking,locks,assignments,{properties=[],reservations=[]}={}){
 if(!property||!booking||booking.property_id!==property.id||booking.owner_id!==property.owner_id||booking.status!=='confirmed'||booking.kind==='block')throw Error('Choose a confirmed booking for this listing.');
 if(booking.departure<=booking.arrival)throw Error('Departure must follow arrival.');
 const start=localInstant(booking.arrival,property.check_in,property.timezone),end=localInstant(booking.departure,property.check_out,property.timezone);
 if(end<=start)throw Error('Access must end after it starts.');
 const routes=assignments.filter(a=>a.property_id===property.id&&a.owner_id===property.owner_id).map(a=>{const lock=locks.find(l=>l.id===a.lock_id&&l.owner_id===property.owner_id&&l.enabled);return lock?{...lock,purpose:a.purpose}:null;}).filter(Boolean);
 const code=savedPhoneCode(booking.guest_phone_last4),issues=[],conflicts=[];
 if(!code)issues.push('Add the guest phone number or its last four digits to this booking before creating door access.');
 if(code){
  const ids=new Set(routes.map(l=>l.id));
  for(const other of reservations){
   if(other.id===booking.id||other.owner_id!==booking.owner_id||other.status!=='confirmed'||other.kind==='block'||savedPhoneCode(other.guest_phone_last4)!==code)continue;
   const common=assignments.filter(a=>a.property_id===other.property_id&&a.owner_id===booking.owner_id&&ids.has(a.lock_id));
   if(!common.length)continue;
   const p=properties.find(p=>p.id===other.property_id&&p.owner_id===booking.owner_id);
   try{
    if(!p||other.departure<=other.arrival)throw Error('Invalid competing stay');
    const a=localInstant(other.arrival,p.check_in,p.timezone),b=localInstant(other.departure,p.check_out,p.timezone);
    if(b<=a)throw Error('Invalid competing access');
    if(start<b&&end>a)for(const route of common)conflicts.push({lock_id:route.lock_id,booking_id:other.id});
   }catch{issues.push('Another booking with the same phone ending has an access window that cannot be verified. Review it before creating access.');}
  }
  if(conflicts.length)issues.push('An overlapping booking uses the same phone ending on an assigned lock. Resolve the conflict before creating access.');
 }
 return {start,end,code,issues,conflicts,timezone:property.timezone,locks:routes,status:issues.length?'needs_review':'draft',startLabel:booking.arrival+' '+property.check_in.slice(0,5),endLabel:booking.departure+' '+property.check_out.slice(0,5)};
}
