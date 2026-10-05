export function localClock(now,timezone){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return {day:`${v.year}-${v.month}-${v.day}`,stamp:`${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}:${v.second}`};
}
export function currentGuest(bookings,property,now=new Date()){
 let stamp;try{stamp=localClock(now,property.timezone).stamp;}catch{return 'Guest';}
 const matches=bookings.filter(b=>b.status==='confirmed'&&stamp>=`${b.arrival}T${property.check_in}`&&stamp<`${b.departure}T${property.check_out}`);
 // Ambiguous stays fail closed to a generic greeting.
 if(matches.length!==1)return 'Guest';
 return matches[0].guest.trim().split(/\s+/)[0]||'Guest';
}
