import {validDay,nights} from './model.mjs';
export function nextDay(day){if(!validDay(day))throw Error('Choose a valid date.');return new Date(Date.parse(day)+86400000).toISOString().slice(0,10);}
export function reportPeriod(start,end){if(!validDay(start)||!validDay(end)||end<start)throw Error('Choose a valid start and end date.');const stop=nextDay(end),count=nights(start,stop);if(count>366)throw Error('Choose up to 366 days per report.');return {start,end,stop,count};}
export function localDay(now,timezone='UTC'){try{const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const get=k=>parts.find(p=>p.type===k)?.value;return `${get('year')}-${get('month')}-${get('day')}`;}catch{return '';}}
const sum=(rows,key)=>rows.reduce((n,r)=>n+r[key],0);
function metrics(properties,reservations,period){
 const rows=properties.map(p=>{
  const own=reservations.filter(r=>r.property_id===p.id),days=Array.from({length:period.count},(_,i)=>new Date(Date.parse(period.start)+i*86400000).toISOString().slice(0,10));
  let booked=0,blocked=0,conflicts=0;
  for(const day of days){const stays=own.filter(r=>r.kind!=='block'&&r.status==='confirmed'&&r.arrival<=day&&r.departure>day),blocks=own.filter(r=>r.status==='blocked'&&r.arrival<=day&&r.departure>day);if(stays.length)booked++;else if(blocks.length)blocked++;if(stays.length>1||(stays.length&&blocks.length))conflicts++;}
  const overlaps=r=>r.arrival<period.stop&&r.departure>period.start;
  const confirmed=own.filter(r=>r.kind!=='block'&&r.status==='confirmed'&&overlaps(r));
  const arrivals=confirmed.filter(r=>r.arrival>=period.start&&r.arrival<period.stop).length;
  const departures=own.filter(r=>r.kind!=='block'&&r.status==='confirmed'&&r.departure>=period.start&&r.departure<period.stop).length;
  const available=period.count-blocked;
  return {id:p.id,name:p.name,timezone:p.timezone,capacity:period.count,booked,blocked,available,open:available-booked,occupancy:available?100*booked/available:null,stays:confirmed.length,arrivals,departures,cancelled:own.filter(r=>r.kind!=='block'&&r.status==='cancelled'&&overlaps(r)).length,conflicts};
 });
 const totals=Object.fromEntries(['capacity','booked','blocked','available','open','stays','arrivals','departures','cancelled','conflicts'].map(k=>[k,sum(rows,k)]));totals.occupancy=totals.available?100*totals.booked/totals.available:null;
 return {rows,totals};
}
export function buildReport({properties=[],reservations=[],tasks=[],start,end,propertyId='',now=new Date()}){
 const period=reportPeriod(start,end),selected=properties.filter(p=>!propertyId||p.id===propertyId),ids=new Set(selected.map(p=>p.id));
 const own=reservations.filter(r=>ids.has(r.property_id)),valid=own.filter(r=>validDay(r.arrival)&&validDay(r.departure)&&r.departure>r.arrival);
 const result=metrics(selected,valid,period),monthly=[];
 let cursor=start;while(cursor<period.stop){const d=new Date(cursor+'T12:00:00Z'),boundary=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)).toISOString().slice(0,10),stop=boundary<period.stop?boundary:period.stop;
 const count=nights(cursor,stop);monthly.push({month:cursor.slice(0,7),start:cursor,end:new Date(Date.parse(stop)-86400000).toISOString().slice(0,10),...metrics(selected,valid,{start:cursor,stop,count}).totals});cursor=stop;}
 const due=tasks.filter(t=>ids.has(t.property_id)&&validDay(t.due_day)&&t.due_day>=start&&t.due_day<=end),work={total:due.length,done:due.filter(t=>t.status==='done').length,dismissed:due.filter(t=>t.status==='dismissed').length,open:due.filter(t=>['open','in_progress'].includes(t.status)).length,overdue:due.filter(t=>['open','in_progress'].includes(t.status)&&t.due_day<localDay(now,selected.find(p=>p.id===t.property_id)?.timezone)).length};
 return {...result,period,monthly,work,invalidRecords:own.length-valid.length};
}
export const percent=n=>n===null?'—':`${n.toFixed(1)}%`;
export function csvCell(value){let s=String(value??'');if(/^[\s]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function reportCsv(report,type='listings'){
 const common=['Capacity nights','Booked nights','Blocked nights','Available nights','Open nights','Occupancy percent','Confirmed stays overlapping period','Arrivals','Departures','Cancelled stays overlapping period','Conflicting nights'];
 const values=r=>[r.capacity,r.booked,r.blocked,r.available,r.open,r.occupancy===null?'':r.occupancy.toFixed(2),r.stays,r.arrivals,r.departures,r.cancelled,r.conflicts];
 const rows=type==='monthly'?[['Month','Period start','Period end',...common],...report.monthly.map(r=>[r.month,r.start,r.end,...values(r)])]:[['Listing','Timezone','Period start','Period end',...common],...report.rows.map(r=>[r.name,r.timezone,report.period.start,report.period.end,...values(r)])];
 return '\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
