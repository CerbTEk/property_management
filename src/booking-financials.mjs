import {nights,validDay} from './model.mjs';
export const amountFields={accommodation_cents:'Accommodation for the whole stay',discount_cents:'Accommodation discount',cleaning_cents:'Cleaning fee',extra_guest_cents:'Extra guest charges',other_fee_cents:'Other guest fees',tax_cents:'Taxes charged',channel_fee_cents:'Channel / booking fees charged to host'};
export function centsInput(value){if(!/^\d+(\.\d{1,2})?$/.test(String(value)))throw Error('Enter non-negative dollar amounts with up to two decimals.');const [whole,decimal='']=String(value).split('.'),cents=Number(whole)*100+Number(decimal.padEnd(2,'0'));if(!Number.isSafeInteger(cents)||cents>1000000000)throw Error('Each charge must be no more than $10,000,000.');return cents;}
export function validateAmounts(amounts){for(const key of Object.keys(amountFields))if(!Number.isSafeInteger(amounts[key])||amounts[key]<0||amounts[key]>1000000000)throw Error('Enter every charge as valid non-negative cents.');if(amounts.discount_cents>amounts.accommodation_cents)throw Error('The discount cannot exceed accommodation charges.');const net=amounts.accommodation_cents-amounts.discount_cents,fees=amounts.cleaning_cents+amounts.extra_guest_cents+amounts.other_fee_cents,total=net+fees+amounts.tax_cents;if(amounts.channel_fee_cents>total)throw Error('Host channel fees cannot exceed the booking total.');return {net,fees,total};}
export function latestFinancials(rows=[]){const map=new Map();for(const row of rows){const old=map.get(row.reservation_id);if(!old||row.revision>old.revision)map.set(row.reservation_id,row);}return map;}
export function financialMatches(row,booking){return Boolean(row&&row.property_id===booking.property_id&&row.arrival===booking.arrival&&row.departure===booking.departure&&row.guests===booking.guests&&row.currency==='USD');}
export function allocatedCents(cents,count,first,stop){const whole=Math.floor(cents/count),remainder=cents%count;return whole*(stop-first)+Math.min(stop,remainder)-Math.min(first,remainder);}
export function financialMetrics(reservations,financials,start,stop){
 const result={accommodation:0,discount:0,fees:0,taxes:0,channelFees:0,charges:0,coveredNights:0,pricedStays:0,missingStays:0,staleStays:0},latest=latestFinancials(financials);
 for(const b of reservations){if(b.kind==='block'||b.status!=='confirmed'||!validDay(b.arrival)||!validDay(b.departure)||b.departure<=b.arrival||b.arrival>=stop||b.departure<=start)continue;
 const row=latest.get(b.id);if(!row){result.missingStays++;continue;}if(!financialMatches(row,b)){result.staleStays++;continue;}
 const count=nights(b.arrival,b.departure),first=b.arrival<start?nights(b.arrival,start):0,last=b.departure>stop?nights(b.arrival,stop):count,part=key=>allocatedCents(Number(row[key]),count,first,last);
 result.accommodation+=part('accommodation_cents');result.discount+=part('discount_cents');result.fees+=part('cleaning_cents')+part('extra_guest_cents')+part('other_fee_cents');result.taxes+=part('tax_cents');result.channelFees+=part('channel_fee_cents');result.coveredNights+=last-first;result.pricedStays++;
 }
 result.charges=result.accommodation-result.discount+result.fees;return result;
}
