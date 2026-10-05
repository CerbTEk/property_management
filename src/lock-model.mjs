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
export function guestAccessPlan(property,booking,locks,assignments){
 if(!property||!booking||booking.property_id!==property.id||booking.owner_id!==property.owner_id||booking.status!=='confirmed'||booking.kind==='block')throw Error('Choose a confirmed booking for this listing.');
 if(booking.departure<=booking.arrival)throw Error('Departure must follow arrival.');
 const start=localInstant(booking.arrival,property.check_in,property.timezone),end=localInstant(booking.departure,property.check_out,property.timezone);
 if(end<=start)throw Error('Access must end after it starts.');
 const routes=assignments.filter(a=>a.property_id===property.id&&a.owner_id===property.owner_id).map(a=>{const lock=locks.find(l=>l.id===a.lock_id&&l.owner_id===property.owner_id&&l.enabled);return lock?{...lock,purpose:a.purpose}:null;}).filter(Boolean);
 return {start,end,timezone:property.timezone,locks:routes,status:'draft',startLabel:booking.arrival+' '+property.check_in.slice(0,5),endLabel:booking.departure+' '+property.check_out.slice(0,5)};
}
