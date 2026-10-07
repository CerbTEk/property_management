import {localClock} from '../supabase/functions/guest-display/schedule.mjs';
export function operationsBoard(data,ownerId,now=Date.now()){
 if(!ownerId||!Number.isFinite(now))throw Error('An owner and current time are required.');
 const properties=(data.properties||[]).filter(p=>p.owner_id===ownerId);
 const bookings=(data.reservations||[]).filter(b=>b.owner_id===ownerId&&b.kind!=='block');
 const people=(data.operationsPeople||[]).filter(p=>p.owner_id===ownerId);
 const rows=(data.tasks||[]).filter(t=>t.owner_id===ownerId).map(t=>{
  const p=properties.find(p=>p.id===t.property_id),b=bookings.find(b=>b.id===t.booking_id);
  let day=null;try{if(p)day=localClock(new Date(now),p.timezone).day;}catch{}
  const active=['open','in_progress'].includes(t.status);
  const person=people.find(person=>person.id===t.assignee_id);
  const assigneeInactive=Boolean(t.assignee_id&&(!person||!person.active)),unassigned=active&&(!t.assignee_id||assigneeInactive);
  const daysAway=day?(Date.parse(t.due_day+'T00:00:00Z')-Date.parse(day+'T00:00:00Z'))/86400000:null;
  const upcoming=active&&daysAway>0&&daysAway<=7;
  const review=active&&(assigneeInactive||(!p||!day||Boolean(t.booking_id&&(!b||b.status==='cancelled'))));
  return {...t,propertyName:p?.name||'Listing unavailable',timezone:p?.timezone||'',guest:b?.guest||'',bookingCancelled:b?.status==='cancelled',active,review,assigneeInactive,unassigned,upcoming,daysAway,assigneeLabel:t.assignee_id?(t.assignee_name||person?.name||'Assigned person unavailable'):'Unassigned',today:active&&day===t.due_day,overdue:active&&Boolean(day&&t.due_day<day)};
 });
 rows.sort((a,b)=>Number(b.review)-Number(a.review)||Number(b.active)-Number(a.active)||a.due_day.localeCompare(b.due_day)||a.id.localeCompare(b.id));
 return {rows,counts:{open:rows.filter(r=>r.active).length,today:rows.filter(r=>r.today).length,overdue:rows.filter(r=>r.overdue).length,review:rows.filter(r=>r.review).length,unassigned:rows.filter(r=>r.unassigned).length,upcoming:rows.filter(r=>r.upcoming).length}};
}
