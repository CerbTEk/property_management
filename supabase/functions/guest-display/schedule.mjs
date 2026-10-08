export function localClock(now,timezone){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return {day:`${v.year}-${v.month}-${v.day}`,stamp:`${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}:${v.second}`};
}
export function currentStay(bookings,property,now=new Date()){
 let stamp;try{stamp=localClock(now,property.timezone).stamp;}catch{return null;}
 const confirmed=bookings.filter(b=>b.status==='confirmed');
 const matches=confirmed.filter(b=>stamp>=`${b.arrival}T${property.check_in}`&&stamp<`${b.departure}T${property.check_out}`);
 // Ambiguous current stays must never fall through to a future guest.
 if(matches.length>1)return null;
 let selected=matches[0];
 if(!selected){
  const upcoming=confirmed.filter(b=>`${b.arrival}T${property.check_in}`>stamp&&b.departure>b.arrival)
   .sort((a,b)=>a.arrival.localeCompare(b.arrival));
  if(!upcoming.length||upcoming[1]?.arrival===upcoming[0].arrival)return null;
  selected=upcoming[0];
 }
 return {guest:String(selected.guest||'').trim().split(/\s+/)[0]||'Guest',arrival:selected.arrival,departure:selected.departure};
}

export function currentGuest(bookings,property,now=new Date()){return currentStay(bookings,property,now)?.guest||'Guest';}
