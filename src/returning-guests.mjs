import {localInstant} from './lock-model.mjs';
const identity=b=>{
 const name=String(b.guest||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
 return name&&/^\d{4}$/.test(b.guest_phone_last4||'')?JSON.stringify([name,b.guest_phone_last4]):null;
};
// A contact match is a host hint, never an authentication or identity decision.
export function returningGuests(data,ownerId,now=Date.now()){
 const result=new Map();if(!ownerId||!Number.isFinite(now))return result;
 const properties=new Map((data.properties||[]).filter(p=>p.owner_id===ownerId).map(p=>[p.id,p]));
 const groups=new Map(),bookings=[];
 for(const b of data.reservations||[]){
  if(b.owner_id!==ownerId||b.kind==='block'||b.status!=='confirmed')continue;
  const key=identity(b),p=properties.get(b.property_id);if(!key||!p)continue;
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
