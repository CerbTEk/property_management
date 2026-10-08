import {normalizeGuestPhone} from './guest-profiles.mjs';
import {validDay,nights} from './model.mjs';
import {phoneLastFour} from './phone-code.mjs';
export const importFields=[['external_id','Original booking ID',true],['guest','Guest name',true],['arrival','Arrival date',true],['departure','Departure date',true],['guests','Guest count',true],['status','Booking status',true],['phone','Guest phone number',false],['note','Note',false]];
export function parseCsv(text,{noun='booking',maxRows=200}={}){
 if(typeof text!=='string'||text.length>524288)throw Error('Use a CSV file up to 512 KB.');
 text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false,closed=false;
 const push=()=>{row.push(cell);cell='';closed=false;};const end=()=>{push();if(row.some(v=>v!==''))rows.push(row);row=[];};
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c===','){push();continue;}if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;end();continue;}
  if(closed)throw Error('Unexpected characters after a quoted CSV field.');
  if(c==='"'){if(cell!=='')throw Error('Quotes must start at the beginning of a CSV field.');quoted=true;}else cell+=c;
 }
 if(quoted)throw Error('A quoted CSV field is not closed.');if(cell!==''||row.length||closed)end();
 if(rows.length<2)throw Error(`Include a header and at least one ${noun}.`);if(rows.length>maxRows+1)throw Error(`Import up to ${maxRows} ${noun}s at a time.`);
 const headers=rows.shift().map(h=>h.trim());if(headers.length>64)throw Error('Use a CSV with up to 64 columns.');if(headers.some(h=>!h)||new Set(headers).size!==headers.length)throw Error('Use unique, non-empty column names.');
 if(rows.some(r=>r.length!==headers.length))throw Error('Every CSV row must match the header column count.');
 return {headers,rows};
}
export const parseBookingCsv=text=>parseCsv(text);
export function suggestMapping(headers){return Object.fromEntries(importFields.map(([key])=>[key,headers.find(h=>h.toLowerCase()===key)||'']));}
const same=(a,b)=>JSON.stringify(Object.keys(a).sort().map(k=>[k,a[k]]))===JSON.stringify(Object.keys(b).sort().map(k=>[k,b[k]]));
export function previewBookingImport(csv,mapping,property,source,bookings=[],receipts=[]){
 if(!property)throw Error('Choose a listing.');if(!['uplisting','airbnb','other'].includes(source))throw Error('Choose an import source.');
 const used=[];for(const [key,label,required] of importFields){const column=mapping[key];if(required&&!column)throw Error(`Map ${label.toLowerCase()}.`);if(column&&!csv.headers.includes(column))throw Error('A mapped column is unavailable.');if(column){if(used.includes(column))throw Error('Map each CSV column to only one field.');used.push(column);}}
 const seen=new Set(),results=[];
 for(let i=0;i<csv.rows.length;i++){
  const get=key=>mapping[key]?csv.rows[i][csv.headers.indexOf(mapping[key])].trim():'';let record=null,error='',action='add';
  try{
   const external_id=get('external_id'),guest=get('guest'),arrival=get('arrival'),departure=get('departure'),count=get('guests'),statusRaw=get('status').toLowerCase();
   const status=['confirmed','booked','accepted'].includes(statusRaw)?'confirmed':['cancelled','canceled'].includes(statusRaw)?'cancelled':null;
   if(!external_id||external_id.length>128)throw Error('Original booking ID must contain 1â€“128 characters.');
   if(seen.has(external_id))throw Error('Repeated original booking ID in this file.');seen.add(external_id);
   if(!guest||guest.length>100)throw Error('Guest name must contain 1â€“100 characters.');
   if(!validDay(arrival)||!validDay(departure)||nights(arrival,departure)>365)throw Error('Use YYYY-MM-DD dates and stays of 1â€“365 nights.');
   if(!/^\d+$/.test(count)||Number(count)<1||Number(count)>100)throw Error('Guest count must be a whole number from 1â€“100.');
   if(!status)throw Error('Use confirmed or cancelled status. Pending/inquiry stays cannot be imported.');
   if(get('note').length>2000)throw Error('Note exceeds 2,000 characters.');
   record={external_id,guest,arrival,departure,guests:Number(count),status,note:get('note'),guest_phone_last4:phoneLastFour(get('phone')),guest_phone:normalizeGuestPhone(get('phone'))};
   const prior=receipts.find(r=>r.source===source&&r.external_id===external_id);
   if(prior){if(prior.property_id!==property.id||!same(prior.snapshot,'guest_phone' in prior.snapshot?record:Object.fromEntries(Object.entries(record).filter(([key])=>key!=='guest_phone'))))throw Error('This original ID has different saved details. Review the existing booking.');action='skip';}
   else{
    if(status==='confirmed'&&(record.guests>property.max_guests||nights(arrival,departure)<property.min_stay))throw Error('Stay exceeds guest capacity or is below the listing minimum nights.');
    if(bookings.some(b=>b.property_id===property.id&&b.kind!=='block'&&b.guest.trim().toLowerCase()===guest.toLowerCase()&&b.arrival===arrival&&b.departure===departure))throw Error('Possible existing booking with the same guest and dates.');
    if(status==='confirmed'&&(bookings.some(b=>b.property_id===property.id&&['confirmed','blocked'].includes(b.status)&&arrival<b.departure&&departure>b.arrival)||results.some(r=>r.action==='add'&&r.record?.status==='confirmed'&&arrival<r.record.departure&&departure>r.record.arrival)))throw Error('Overlaps an occupied date or another booking in this file.');
   }
  }catch(e){error=e.message;action='review';}
  results.push({row:i+2,record,action,error});
 }
 return {rows:results,added:results.filter(r=>r.action==='add').length,skipped:results.filter(r=>r.action==='skip').length,errors:results.filter(r=>r.action==='review').length};
}
