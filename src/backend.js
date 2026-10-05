import {createClient} from '@supabase/supabase-js';
import {publicConnection} from './public-config.js';
const url=import.meta.env.VITE_SUPABASE_URL || publicConnection.url;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || publicConnection.key;
// A service-role JWT must never be accepted as browser configuration.
let privileged=false;
try{if(key?.split('.').length===3)privileged=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='service_role';}catch{}
export const configured=Boolean(url&&key&&!privileged&&!key.startsWith('sb_secret_'));
export const db=configured?createClient(url,key):null;
export async function workspace(){const results=await Promise.all(['properties','reservations','rates','message_templates','guest_displays','locks','lock_assignments'].map(t=>db.from('ts_'+t).select('*').order(t==='reservations'?'arrival':'created_at')));for(const r of results)if(r.error)throw Error(r.error.message);return Object.fromEntries(['properties','reservations','rates','templates','displays','locks','lockAssignments'].map((k,i)=>[k,results[i].data]));}
export async function insert(table,value){const query=db.from('ts_'+table);const {error}=await (table==='rates'?query.upsert(value,{onConflict:'property_id,day'}):query.insert(value));if(error)throw Error(error.code==='23P01'?'This listing has a booking or blocked dates overlapping this period.':error.message);}
export async function cancel(id){const {error}=await db.from('ts_reservations').update({status:'cancelled'}).eq('id',id);if(error)throw Error(error.message);}
export async function updatePricing(id,value){const {error}=await db.from('ts_properties').update(value).eq('id',id);if(error)throw Error(error.message);}

export async function updateRecord(table,id,value){const {data,error}=await db.from('ts_'+table).update(value).eq('id',id).select('id');if(error)throw Error(error.code==='23P01'?'This listing has a booking or blocked dates overlapping this period.':error.message);if(data.length!==1)throw Error('Record unavailable. Refresh your workspace and try again.');}
