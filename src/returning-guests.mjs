import {localInstant} from './lock-model.mjs';
// Saved profile links, never names or phone suffixes, identify booking history.
export function returningGuests(data,ownerId,now=Date.now()){
 const result=new Map();if(!ownerId||!Number.isFinite(now))return result;
 const properties=new Map((data.properties||[]).filter(p=>p.owner_id===ownerId).map(p=>[p.id,p]));
 const profiles=new Set((data.guestProfiles||[]).filter(g=>g.owner_id===ownerId).map(g=>g.id));
 const groups=new Map(),bookings=[];
 for(const b of data.reservations||[]){
  if(b.owner_id!==ownerId||b.kind==='block'||b.status!=='confirmed')continue;
  const key=b.guest_id||(profiles.has(b.id)?b.id:null),p=properties.get(b.property_id);if(!key||!profiles.has(key)||!p)continue;
  try{
   const start=localInstant(b.arrival,p.check_in,p.timezone),end=localInstant(b.departure,p.check_out,p.timezone);
   if(end<=start)continue;
   const row={id:b.id,start,end,departure:b.departure};bookings.push({...row,key});
   if(end<=now){if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  }catch{}
 }
 for(const group of groups.values())group.sort((a,b)=>a.end-b.end);
 for(const b of bookings){
  const history=groups.get(b.key)||[];let low=0,high=history.length;
  while(low<high){const mid=(low+high)>>1;if(history[mid].end<=b.start)low=mid+1;else high=mid;}
  if(low)result.set(b.id,{count:low,lastDeparture:history[low-1].departure});
 }
 return result;
}
