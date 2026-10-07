import {quote,validDay} from './model.mjs';import {validateAmounts,centsInput} from './booking-financials.mjs';
export const defaultRules={revision:0,cleaning_cents:0,included_guests:1,extra_guest_cents:0,weekly_bps:0,monthly_bps:0,last_minute_days:0,last_minute_bps:0};
export function rulesFor(rows=[],propertyId){return rows.find(r=>r.property_id===propertyId)||defaultRules;}
export function percentageBps(value){const bps=centsInput(value);if(bps>10000)throw Error('Discount percentages must be between 0 and 100.');return bps;}
export function validateRules(r){const limits={cleaning_cents:[0,1000000],included_guests:[1,100],extra_guest_cents:[0,100000],weekly_bps:[0,10000],monthly_bps:[0,10000],last_minute_days:[0,365],last_minute_bps:[0,10000]};for(const [key,[min,max]] of Object.entries(limits))if(!Number.isInteger(r[key])||r[key]<min||r[key]>max)throw Error('Enter valid fee and discount values within the displayed limits.');return r;}
export function ruleQuote(property,arrival,departure,guests,rates=[],rules=defaultRules,quotedOn){
 validateRules(rules);if(!Number.isInteger(guests)||guests<1||guests>property.max_guests)throw Error('Choose a guest count within the listing’s occupancy limit.');if(!validDay(quotedOn)||quotedOn>arrival)throw Error('Choose a booking / quote date on or before arrival.');
 const q=quote(property,arrival,departure,rates);if(q.nights<property.min_stay)throw Error(`Minimum stay is ${property.min_stay} nights.`);
 const leadDays=Math.round((Date.parse(arrival)-Date.parse(quotedOn))/86400000),options=[];
 if(q.nights>=28)options.push({name:'Monthly stay',bps:rules.monthly_bps});if(q.nights>=7)options.push({name:'Weekly stay',bps:rules.weekly_bps});if(rules.last_minute_days>0&&leadDays<=rules.last_minute_days)options.push({name:'Last-minute booking',bps:rules.last_minute_bps});
 const discount=options.sort((a,b)=>b.bps-a.bps).find(o=>o.bps>0)||{name:'No discount',bps:0};
 const amounts={accommodation_cents:Math.round(q.markedUp*100),discount_cents:Math.round(Math.round(q.markedUp*100)*discount.bps/10000),cleaning_cents:rules.cleaning_cents,extra_guest_cents:Math.max(0,guests-rules.included_guests)*q.nights*rules.extra_guest_cents,other_fee_cents:0,tax_cents:0,channel_fee_cents:0};
 return {...validateAmounts(amounts),amounts,nights:q.nights,baseCents:Math.round(q.total*100),markupCents:Math.round(q.markedUp*100)-Math.round(q.total*100),discount,leadDays,quotedOn,ruleRevision:rules.revision};
}
