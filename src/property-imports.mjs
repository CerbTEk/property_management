import {parseCsv} from './booking-imports.mjs';
import {centsInput} from './booking-financials.mjs';
export const propertyImportFields=[['external_id','Original listing ID'],['name','Listing name'],['timezone','Timezone'],['currency','Currency (USD)'],['weekday','Weekday rate ($)'],['weekend','Friday/Saturday rate ($)'],['markup','Channel markup (%)'],['max_guests','Maximum guests'],['min_stay','Minimum nights'],['check_in','Check-in (HH:MM)'],['check_out','Check-out (HH:MM)']];
export const parsePropertyCsv=text=>parseCsv(text,{noun:'listing',maxRows:50});
export const propertyMapping=headers=>Object.fromEntries(propertyImportFields.map(([key])=>[key,headers.find(h=>h.toLowerCase()===key)||'']));
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const sameSnapshot=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function listingSnapshot(p,external_id){return {external_id,name:p.name,timezone:p.timezone,currency:'USD',weekday_cents:p.weekday_cents,weekend_cents:p.weekend_cents,markup_percent:Number(p.markup_percent),max_guests:p.max_guests,min_stay:p.min_stay,check_in:p.check_in.slice(0,5),check_out:p.check_out.slice(0,5)};}
export function previewPropertyImport(csv,mapping,source,properties=[],receipts=[],targets={}){
 if(!['uplisting','airbnb','other'].includes(source))throw Error('Choose an import source.');const columns=[];
 for(const [key,label] of propertyImportFields){if(!mapping[key])throw Error(`Map ${label.toLowerCase()}.`);if(!csv.headers.includes(mapping[key]))throw Error('Mapped column unavailable.');if(columns.includes(mapping[key]))throw Error('Map each column to only one field.');columns.push(mapping[key]);}
 const seen=new Set(),results=[],names=new Set(),links=new Set();
 for(let i=0;i<csv.rows.length;i++){
  const get=key=>csv.rows[i][csv.headers.indexOf(mapping[key])].trim();let record=null,error='',action='create',external_id=get('external_id');
  try{
   if(!external_id||external_id.length>128)throw Error('Original listing ID must contain 1–128 characters.');if(seen.has(external_id))throw Error('Repeated original listing ID.');seen.add(external_id);
   const name=get('name'),timezone=get('timezone');if(!name||name.length>120)throw Error('Listing name must contain 1–120 characters.');try{new Intl.DateTimeFormat('en',{timeZone:timezone});if(!timezone)throw Error();}catch{throw Error('Use a valid timezone such as America/New_York.');}
   if(get('currency')!=='USD')throw Error('Only USD listing rates are supported. No currency conversion is performed.');
   const weekday_cents=centsInput(get('weekday')),weekend_cents=centsInput(get('weekend'));if([weekday_cents,weekend_cents].some(v=>v<100||v>1000000))throw Error('Nightly rates must be $1–$10,000.');
   if(!/^\d+(\.\d{1,2})?$/.test(get('markup'))||Number(get('markup'))>100)throw Error('Markup must be 0–100% with up to two decimals.');
   const whole=(key,min,max)=>{const v=get(key);if(!/^\d+$/.test(v)||Number(v)<min||Number(v)>max)throw Error(`${key==='max_guests'?'Guests':'Minimum nights'} must be a whole number from ${min}–${max}.`);return Number(v);};
   const max_guests=whole('max_guests',1,100),min_stay=whole('min_stay',1,365),check_in=get('check_in'),check_out=get('check_out');if(![check_in,check_out].every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))throw Error('Use 24-hour HH:MM check-in and check-out times.');
   record={external_id,name,timezone,currency:'USD',weekday_cents,weekend_cents,markup_percent:Number(get('markup')),max_guests,min_stay,check_in,check_out};
   const prior=receipts.find(r=>r.source===source&&r.external_id===external_id),target=targets[external_id]||null;
   if(prior){if(!sameSnapshot(prior.snapshot,record)||(target&&target!==prior.property_id))throw Error('Original ID already has different saved details. Review the existing listing.');action='skip';}
   else if(target){const p=properties.find(p=>p.id===target);if(!p||!sameSnapshot(listingSnapshot(p,external_id),record)||p.check_in.slice(5)&&p.check_in.slice(5)!==':00'||p?.check_out.slice(5)&&p.check_out.slice(5)!==':00')throw Error('Existing listing settings must match every imported value before linking.');if(links.has(target)||receipts.some(r=>r.source===source&&r.property_id===target))throw Error('This listing is already linked to another original ID from this source.');links.add(target);action='link';}
   else{const normalized=name.toLowerCase();if(properties.some(p=>p.name.trim().toLowerCase()===normalized)||names.has(normalized))throw Error('Listing name already exists. Choose the matching existing listing or correct the CSV.');names.add(normalized);}
  }catch(e){error=e.message;action='review';}
  results.push({row:i+2,external_id,record,target_property:targets[external_id]||null,action,error});
 }
 return {rows:results,created:results.filter(r=>r.action==='create').length,linked:results.filter(r=>r.action==='link').length,skipped:results.filter(r=>r.action==='skip').length,errors:results.filter(r=>r.action==='review').length};
}
