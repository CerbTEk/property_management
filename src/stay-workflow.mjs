import {localInstant,guestAccessPlan} from './lock-model.mjs';
import {localClock} from '../supabase/functions/guest-display/schedule.mjs';

// Derived from saved bookings. A scheduled stay is never proof of a guest's
// physical arrival, an online TV, or an installed door code.
export function stayWorkflow(data,ownerId,now=Date.now()){
 if(!ownerId||!Number.isFinite(now))throw Error('An owner and current time are required.');
 const owned=key=>(data[key]||[]).filter(x=>x.owner_id===ownerId);
 const properties=owned('properties'),reservations=owned('reservations');
 const locks=owned('locks'),assignments=owned('lockAssignments');
 const rows=reservations.filter(b=>b.kind!=='block'&&['confirmed','cancelled'].includes(b.status)).map(b=>{
  const property=properties.find(p=>p.id===b.property_id);
  const row={id:b.id,guest:b.guest,propertyId:b.property_id,propertyName:property?.name||'Listing unavailable',arrival:b.arrival,departure:b.departure,timezone:property?.timezone||'',start:null,end:null,stage:'review',arrivalToday:false,departureToday:false,issues:[],access:{state:'needs_review',lockCount:0,issues:[]},tv:{state:'needs_setup',screenCount:0,personalized:false,rules:false}};
  try{
   if(!property)throw Error('Listing unavailable.');
   const start=localInstant(b.arrival,property.check_in,property.timezone),end=localInstant(b.departure,property.check_out,property.timezone);
   if(end<=start)throw Error('Departure must follow arrival.');
   const day=localClock(new Date(now),property.timezone).day;
   Object.assign(row,{start,end,checkIn:property.check_in.slice(0,5),checkOut:property.check_out.slice(0,5),arrivalToday:b.arrival===day,departureToday:b.departure===day,stage:now<start?'upcoming':now<end?'in_stay':'finished'});
  }catch(e){row.issues.push(e.message);}
  if(b.status==='cancelled'){row.stage='cancelled';row.arrivalToday=false;row.departureToday=false;row.tv.state='generic';row.access.state='cleanup_unverified';return row;}
  if(row.stage==='finished'){row.tv.state='generic';row.access.state='cleanup_unverified';return row;}
  try{
   const plan=guestAccessPlan(property,b,locks,assignments,{properties,reservations});
   row.access={state:plan.issues.length?'needs_review':'draft_ready',lockCount:plan.locks.length,issues:plan.issues};
  }catch(e){row.access.issues.push(e.message);}
  const display=owned('displays').find(d=>d.property_id===b.property_id);
  const screens=owned('displayDevices').filter(d=>d.property_id===b.property_id&&!d.revoked&&!d.pairing_expires_at&&Date.parse(d.expires_at)>now);
  row.tv={state:display&&screens.length&&display.personalize?'scheduled':'needs_setup',screenCount:screens.length,personalized:display?.personalize===true,rules:Boolean(display?.house_rules?.trim())};
  return row;
 });
 rows.sort((a,b)=>(a.start??-Infinity)-(b.start??-Infinity)||String(a.id).localeCompare(String(b.id)));
 const active=rows.filter(r=>!['finished','cancelled'].includes(r.stage));
 return {rows,counts:{arrivals:active.filter(r=>r.arrivalToday).length,departures:rows.filter(r=>r.departureToday).length,inStay:active.filter(r=>r.stage==='in_stay').length,review:active.filter(r=>r.issues.length||r.access.state==='needs_review'||r.tv.state==='needs_setup'||!r.tv.rules).length}};
}
