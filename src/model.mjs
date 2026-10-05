export function validDay(day){return /^\d{4}-\d{2}-\d{2}$/.test(day)&&!isNaN(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;}
export function nights(a,b){if(!validDay(a)||!validDay(b)||b<=a)throw Error('Departure must follow arrival.');return Math.round((Date.parse(b)-Date.parse(a))/86400000);}
export function quote(property,arrival,departure,rates=[]){const count=nights(arrival,departure);if(count>365)throw Error('Quote up to 365 nights at a time.');let cents=0;for(let i=0;i<count;i++){const day=new Date(Date.parse(arrival)+i*86400000).toISOString().slice(0,10);const override=rates.find(r=>r.property_id===property.id&&r.day===day);const dow=new Date(day+'T12:00:00Z').getUTCDay();cents+=Number(override?.amount_cents??(dow===5||dow===6?property.weekend_cents:property.weekday_cents));}return {nights:count,total:cents/100,markedUp:Math.round(cents*(1+Number(property.markup_percent)/100))/100};}
export const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
export function calendarDays(month,reservations=[],propertyId=''){
 if(!/^\d{4}-\d{2}$/.test(month)||!validDay(month+'-01'))throw Error('Use a valid calendar month.');
 const first=new Date(month+'-01T12:00:00Z'),count=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 return {padding:first.getUTCDay(),days:Array.from({length:count},(_,i)=>{const day=month+'-'+String(i+1).padStart(2,'0');return {day,bookings:reservations.filter(r=>['confirmed','blocked'].includes(r.status)&&(!propertyId||r.property_id===propertyId)&&r.arrival<=day&&r.departure>day)};})};
}
