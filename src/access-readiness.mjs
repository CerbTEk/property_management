import {guestAccessPlan,localInstant} from './lock-model.mjs';
// Owner-scoped, read-only assessment. A ready draft is never proof of installation.
export function accessReadiness(data,ownerId,{now=Date.now()}={}){
 if(!ownerId||!Number.isFinite(now))throw Error('An owner and current time are required.');
 const properties=(data.properties||[]).filter(p=>p.owner_id===ownerId);
 const locks=(data.locks||[]).filter(l=>l.owner_id===ownerId);
 const assignments=(data.lockAssignments||[]).filter(a=>a.owner_id===ownerId);
 const reservations=(data.reservations||[]).filter(r=>r.owner_id===ownerId&&r.status==='confirmed'&&r.kind!=='block');
 const rows=[];
 for(const booking of reservations){
  const property=properties.find(p=>p.id===booking.property_id);
  let start,end;
  try{if(property){start=localInstant(booking.arrival,property.check_in,property.timezone);end=localInstant(booking.departure,property.check_out,property.timezone);}}catch{}
  if(Number.isFinite(start)&&Number.isFinite(end)&&end>start&&end<=now)continue;
  try{
   const plan=guestAccessPlan(property,booking,locks,assignments,{properties,reservations});
   rows.push({id:booking.id,guest:booking.guest,propertyName:property.name,arrival:booking.arrival,departure:booking.departure,start:plan.start,end:plan.end,timezone:plan.timezone,startLabel:plan.startLabel,endLabel:plan.endLabel,lockCount:plan.locks.length,issues:plan.issues,state:plan.issues.length?'needs_review':'draft_ready',stayState:plan.start<=now?'in_stay':'upcoming'});
  }catch(e){
   rows.push({id:booking.id,guest:booking.guest,propertyName:property?.name||'Listing unavailable',arrival:booking.arrival,departure:booking.departure,start:null,end:null,timezone:property?.timezone||'',lockCount:0,issues:[e.message],state:'needs_review',stayState:'unverified'});
  }
 }
 // Put unverifiable stays first so bad dates cannot disappear below future arrivals.
 rows.sort((a,b)=>(a.start??-Infinity)-(b.start??-Infinity)||String(a.id).localeCompare(String(b.id)));
 return {rows,reviewCount:rows.filter(r=>r.state==='needs_review').length,draftCount:rows.filter(r=>r.state==='draft_ready').length,inStayCount:rows.filter(r=>r.stayState==='in_stay').length};
}
