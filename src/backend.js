import {createClient} from '@supabase/supabase-js';
import {loadWorkspacePages} from './workspace-pages.mjs';
import {publicConnection} from './public-config.js';
import {nativeLockCallback} from './native-lock-browser.mjs';
const url=import.meta.env.VITE_SUPABASE_URL || publicConnection.url;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || publicConnection.key;
// A service-role JWT must never be accepted as browser configuration.
let privileged=false;
try{if(key?.split('.').length===3)privileged=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='service_role';}catch{}
export const configured=Boolean(url&&key&&!privileged&&!key.startsWith('sb_secret_'));
export const db=configured?createClient(url,key,{auth:{detectSessionInUrl:!nativeLockCallback}}):null;
export async function workspace(){
 const tables=['properties','reservations','rates','message_templates','guest_displays','locks','lock_assignments','lock_connections','market_comparables','display_devices','operations_tasks','display_images','turnover_templates','message_rules','message_queue','operations_people','operations_defaults','staff_invites','booking_financials','booking_transactions','pricing_rules','booking_imports','property_imports','financial_imports'];
 const keys=['properties','reservations','rates','templates','displays','locks','lockAssignments','lockConnections','comparables','displayDevices','tasks','displayImages','turnoverTemplates','messageRules','messageQueue','operationsPeople','operationsDefaults','staffInvites','bookingFinancials','bookingTransactions','pricingRules','bookingImports','propertyImports','financialImports'];
 const results=await Promise.all(tables.map(t=>{
  const columns=t==='display_devices'?'id,owner_id,property_id,name,revoked,expires_at,pairing_expires_at':t==='display_images'?'id,owner_id,property_id':'*',order=t==='reservations'?'arrival':t==='display_devices'?'expires_at':'created_at';
  if(['properties','reservations','operations_tasks','booking_financials','booking_transactions','pricing_rules','booking_imports','property_imports','financial_imports'].includes(t))return loadWorkspacePages((start,end,first)=>db.from('ts_'+t).select(columns,first?{count:'exact'}:{}).order(order).order('id').range(start,end));
  return db.from('ts_'+t).select(columns).order(order);
 }));
 for(const r of results)if(r.error)throw Error(r.error.message);
 return Object.fromEntries(keys.map((k,i)=>[k,results[i].data]));
}
export async function insert(table,value){const query=db.from('ts_'+table);const {error}=await (table==='rates'?query.upsert(value,{onConflict:'property_id,day'}):query.insert(value));if(error)throw Error(error.code==='23P01'?'This listing has a booking or blocked dates overlapping this period.':error.message);}
export async function cancel(id){await updateRecord('reservations',id,{status:'cancelled'});}
export async function updatePricing(id,value){const {error}=await db.from('ts_properties').update(value).eq('id',id);if(error)throw Error(error.message);}

export async function updateRecord(table,id,value){const {data,error}=await db.from('ts_'+table).update(value).eq('id',id).select('id');if(error)throw Error(error.code==='23P01'?'This listing has a booking or blocked dates overlapping this period.':error.message);if(data.length!==1)throw Error('Record unavailable. Refresh your workspace and try again.');}

export async function editRates(propertyId,edit,expected){const {data,error}=await db.rpc('ts_edit_rates',{p_property:propertyId,p_start:edit.start,p_end:edit.end,p_weekdays:edit.weekdays,p_mode:edit.mode,p_value:edit.mode==='clear'?null:edit.value,p_floor:edit.floor,p_ceiling:edit.ceiling,p_expected:expected});if(error)throw Error(error.message);return data;}
export async function saveComparable(value){const {error}=await db.from('ts_market_comparables').upsert(value,{onConflict:'property_id,source_url,arrival,departure,guests'});if(error)throw Error(error.message);}
export async function removeComparable(id){const {data,error}=await db.from('ts_market_comparables').delete().eq('id',id).select('id');if(error)throw Error(error.message);if(data.length!==1)throw Error('Comparable unavailable. Refresh and try again.');}
