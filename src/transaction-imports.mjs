import {parseCsv} from './booking-imports.mjs';
import {sameSnapshot} from './property-imports.mjs';
import {centsInput} from './booking-financials.mjs';
import {paymentBalance,validateTransaction} from './booking-transactions.mjs';
import {validDay} from './model.mjs';
export const transactionImportFields=[['transaction_id','Original transaction ID'],['booking_id','Original booking ID'],['guest','Guest name'],['arrival','Arrival date'],['departure','Departure date'],['guests','Guest count'],['kind','Type (payment/refund)'],['amount','Completed amount ($)'],['currency','Currency (USD)'],['occurred_on','Completed date (YYYY-MM-DD, UTC)'],['method','Method (channel/bank/cash/other)'],['reference','Transaction reference'],['parent_transaction_id','Original payment ID (blank for payments)']];
export const parseTransactionCsv=text=>parseCsv(text,{noun:'transaction',maxRows:200});
export const transactionMapping=headers=>Object.fromEntries(transactionImportFields.map(([key])=>[key,headers.find(h=>h.toLowerCase()===key)||'']));
export function previewTransactionImport(csv,mapping,property,source,bookings=[],bookingImports=[],entries=[],receipts=[],today=new Date().toISOString().slice(0,10)){
 if(!property)throw Error('Choose a listing.');if(!['uplisting','airbnb','other'].includes(source))throw Error('Choose an import source.');const columns=[];
 for(const [key,label] of transactionImportFields){if(!mapping[key])throw Error(`Map ${label.toLowerCase()}.`);if(!csv.headers.includes(mapping[key]))throw Error('Mapped column unavailable.');if(columns.includes(mapping[key]))throw Error('Map each column to one field.');columns.push(mapping[key]);}
 const seen=new Set(),rows=[];
 for(let i=0;i<csv.rows.length;i++){
  const get=key=>csv.rows[i][csv.headers.indexOf(mapping[key])].trim();const transaction_id=get('transaction_id');let record=null,booking=null,error='',action='add';
  try{
   if(!transaction_id||transaction_id.length>128||!get('booking_id')||get('booking_id').length>128)throw Error('Original transaction and booking IDs must contain 1–128 characters.');if(seen.has(transaction_id))throw Error('Repeated original transaction ID.');seen.add(transaction_id);
   const kind=get('kind').toLowerCase(),method=get('method').toLowerCase(),amount_cents=centsInput(get('amount')),parent_transaction_id=get('parent_transaction_id');
   if(!['payment','refund'].includes(kind)||!['channel','bank','cash','other'].includes(method)||amount_cents<1)throw Error('Use a payment/refund, supported method and positive amount.');
   if(get('currency')!=='USD'||!validDay(get('occurred_on'))||get('occurred_on')>today)throw Error('Use USD and a completed transaction date no later than today (UTC).');
   if(!get('guest')||get('guest').length>100||!validDay(get('arrival'))||!validDay(get('departure'))||get('departure')<=get('arrival')||!/^\d+$/.test(get('guests'))||Number(get('guests'))<1||Number(get('guests'))>100)throw Error('Use valid guest and stay details.');
   if(!get('reference')||get('reference').length>160||parent_transaction_id.length>128||(kind==='payment'&&parent_transaction_id)||(kind==='refund'&&!parent_transaction_id))throw Error('Add a reference; refunds need the original payment ID and payments leave it blank.');
   record={transaction_id,booking_id:get('booking_id'),guest:get('guest'),arrival:get('arrival'),departure:get('departure'),guests:Number(get('guests')),kind,amount_cents,currency:'USD',occurred_on:get('occurred_on'),method,reference:get('reference'),parent_transaction_id};
   const link=bookingImports.find(r=>r.source===source&&r.external_id===record.booking_id);
   if(!link||link.property_id!==property.id)throw Error('Import the reservation into this listing first.');booking=bookings.find(b=>b.id===link.reservation_id&&b.property_id===property.id&&b.kind!=='block');if(!booking)throw Error('Linked booking unavailable.');
   const prior=receipts.find(r=>r.source===source&&r.external_id===transaction_id);
   if(prior){if(prior.property_id!==property.id||prior.booking_id!==booking.id||!sameSnapshot(prior.snapshot,record))throw Error('Original transaction ID has different saved details. Review the ledger.');action='skip';}
   else{
    if(record.guest!==booking.guest||record.arrival!==booking.arrival||record.departure!==booking.departure||record.guests!==booking.guests)throw Error('Guest or stay details differ from the current booking.');
    if(kind==='payment'&&booking.status!=='confirmed')throw Error('New payments require a confirmed booking. Cancelled-stay history needs separate review.');
    if(entries.some(t=>t.booking_id===booking.id&&!receipts.some(r=>r.transaction_id===t.id)))throw Error('This booking has manually recorded transaction history. Reconcile it before importing more records.');
   }
  }catch(e){error=e.message;action='review';}
  rows.push({row:i+2,transaction_id,record,booking,error,action});
 }
 const simulated=[...entries],links=[...receipts];
 for(const row of [...rows].sort((a,b)=>(a.record?.kind==='refund')-(b.record?.kind==='refund'))){
  if(row.action!=='add')continue;try{
   const r=row.record,b=row.booking;let relatedId=null;
   if(r.kind==='refund'){
    const parent=links.find(l=>l.source===source&&l.external_id===r.parent_transaction_id&&l.booking_id===b.id);
    if(!parent)throw Error('Refund payment must be imported in this file or a previous import for this booking.');
    const payment=simulated.find(t=>t.id===parent.transaction_id&&t.kind==='payment');if(!payment||r.occurred_on<payment.occurred_on)throw Error('Refund must reference a payment and occur on or after its completed date.');relatedId=payment.id;
   }
   if(simulated.some(t=>t.booking_id===b.id&&t.kind===r.kind&&t.reference.trim().toLowerCase()===r.reference.toLowerCase()))throw Error('A record with this type and reference already exists.');
   const balance=paymentBalance(b,[],simulated);validateTransaction({kind:r.kind,amount:r.amount_cents,date:r.occurred_on,reference:r.reference,note:'Imported transaction',relatedId},balance,today);
   const id=`preview:${r.transaction_id}`;simulated.push({id,booking_id:b.id,sequence:balance.sequence+1,kind:r.kind,amount_cents:r.amount_cents,related_id:relatedId,occurred_on:r.occurred_on,reference:r.reference});links.push({source,external_id:r.transaction_id,booking_id:b.id,transaction_id:id});
  }catch(e){row.error=e.message;row.action='review';}
 }
 const added=rows.filter(r=>r.action==='add');return {rows,added:added.length,skipped:rows.filter(r=>r.action==='skip').length,errors:rows.filter(r=>r.action==='review').length,paymentCents:added.filter(r=>r.record.kind==='payment').reduce((n,r)=>n+r.record.amount_cents,0),refundCents:added.filter(r=>r.record.kind==='refund').reduce((n,r)=>n+r.record.amount_cents,0)};
}
