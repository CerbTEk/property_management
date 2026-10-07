import {parseCsv} from './booking-imports.mjs';
import {amountFields,centsInput,validateAmounts} from './booking-financials.mjs';
import {sameSnapshot} from './property-imports.mjs';
import {validDay} from './model.mjs';
export const financialImportFields=[['external_id','Original booking ID'],['guest','Guest name'],['arrival','Arrival (YYYY-MM-DD)'],['departure','Departure (YYYY-MM-DD)'],['guests','Guest count'],['currency','Currency (USD)'],...Object.entries(amountFields).map(([key,label])=>[key.replace('_cents',''),label+' ($)'])];
export const parseFinancialCsv=text=>parseCsv(text,{noun:'charge record',maxRows:200});
export const financialMapping=headers=>Object.fromEntries(financialImportFields.map(([key])=>[key,headers.find(h=>h.toLowerCase()===key)||'']));
export function previewFinancialImport(csv,mapping,property,source,bookings=[],bookingImports=[],financials=[],receipts=[]){
 if(!property)throw Error('Choose a listing.');if(!['uplisting','airbnb','other'].includes(source))throw Error('Choose an import source.');const columns=[];
 for(const [key,label] of financialImportFields){if(!mapping[key])throw Error(`Map ${label.toLowerCase()}. Enter explicit zeros for absent charges.`);if(!csv.headers.includes(mapping[key]))throw Error('Mapped column unavailable.');if(columns.includes(mapping[key]))throw Error('Map each column to only one field.');columns.push(mapping[key]);}
 const seen=new Set(),results=[];
 for(let i=0;i<csv.rows.length;i++){
  const get=key=>csv.rows[i][csv.headers.indexOf(mapping[key])].trim();let record=null,booking=null,error='',action='add',totals=null;const external_id=get('external_id');
  try{
   const guest=get('guest'),arrival=get('arrival'),departure=get('departure'),guests=get('guests');
   if(!external_id||external_id.length>128)throw Error('Original booking ID must contain 1–128 characters.');if(seen.has(external_id))throw Error('Repeated original booking ID.');seen.add(external_id);
   if(!guest||guest.length>100||!validDay(arrival)||!validDay(departure)||departure<=arrival||!/^\d+$/.test(guests)||Number(guests)<1||Number(guests)>100)throw Error('Use a valid guest, stay dates and whole guest count.');
   if(get('currency')!=='USD')throw Error('Only USD is supported; amounts will not be converted.');
   const amounts=Object.fromEntries(Object.keys(amountFields).map(key=>[key,centsInput(get(key.replace('_cents','')))]));totals=validateAmounts(amounts);
   record={external_id,guest,arrival,departure,guests:Number(guests),currency:'USD',amounts};
   const link=bookingImports.find(r=>r.source===source&&r.external_id===external_id);
   if(!link||link.property_id!==property.id)throw Error('Import this booking into the selected listing first.');
   booking=bookings.find(b=>b.id===link.reservation_id&&b.property_id===property.id&&b.kind!=='block');if(!booking)throw Error('Linked booking unavailable. Refresh your workspace.');
   const prior=receipts.find(r=>r.source===source&&r.external_id===external_id);
   if(prior){if(prior.property_id!==property.id||prior.reservation_id!==booking.id||!sameSnapshot(prior.snapshot,record))throw Error('Original ID already has different imported charges. Review the booking amounts.');action='skip';}
   else{
    if(booking.status!=='confirmed')throw Error('Cancelled bookings require a separate settlement review.');
    if(guest!==booking.guest||arrival!==booking.arrival||departure!==booking.departure||Number(guests)!==booking.guests)throw Error('Guest or stay details differ from the current booking. Review it before importing charges.');
    if(financials.some(f=>f.reservation_id===booking.id))throw Error('This booking already has charge history. Review it in Booking amounts; import will not overwrite or append to it.');
   }
  }catch(e){error=e.message;action='review';}
  results.push({row:i+2,external_id,record,booking,totals,action,error});
 }
 return {rows:results,added:results.filter(r=>r.action==='add').length,skipped:results.filter(r=>r.action==='skip').length,errors:results.filter(r=>r.action==='review').length,totalCents:results.filter(r=>r.action==='add').reduce((sum,r)=>sum+r.totals.total,0)};
}
