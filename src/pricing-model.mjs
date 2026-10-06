import {validDay,calendarDays,nights} from './model.mjs';
export const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export const stayTypes={unspecified:'Choose accommodation type',private_room:'Private room',entire_place:'Entire place',shared_room:'Shared room',hotel:'Hotel room'};
export function todayInZone(zone='UTC',now=new Date()){const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);return ['year','month','day'].map(t=>parts.find(p=>p.type===t).value).join('-');}
export function addDay(day,n=1){if(!validDay(day))throw Error('Choose a valid date.');return new Date(Date.parse(day)+n*86400000).toISOString().slice(0,10);}
export function baseRate(p,day){return [5,6].includes(new Date(day+'T12:00:00Z').getUTCDay())?p.weekend_cents:p.weekday_cents;}
export function nightRate(p,day,rates=[]){const override=rates.find(r=>r.property_id===p.id&&r.day===day);const cents=Number(override?.amount_cents??baseRate(p,day));return {day,cents,guestCents:Math.round(cents*(1+Number(p.markup_percent)/100)),override:Boolean(override)};}
export function priceCalendar(p,month,rates=[],reservations=[]){const grid=calendarDays(month,reservations,p.id);return {...grid,days:grid.days.map(d=>({...d,...nightRate(p,d.day,rates)}))};}
export function pricePreview(p,rates,edit){
 const {start,end,weekdays,mode,value,floor=100,ceiling=1000000}=edit;
 if(!p||!validDay(start)||!validDay(end)||end<start||Date.parse(end)-Date.parse(start)>365*86400000)throw Error('Choose up to 366 dates, including the last night.');
 if(!Array.isArray(weekdays)||!weekdays.length||weekdays.some(d=>!Number.isInteger(d)||d<0||d>6))throw Error('Choose at least one weekday.');
 if(!['set','percent','clear'].includes(mode))throw Error('Choose a price action.');
 if(!Number.isInteger(floor)||!Number.isInteger(ceiling)||floor<100||ceiling>1000000||floor>ceiling)throw Error('Set valid minimum and maximum nightly prices.');
 if(mode==='set'&&(!Number.isInteger(value)||value<100||value>1000000))throw Error('Rate must be between $1 and $10,000.');
 if(mode==='percent'&&(!Number.isFinite(value)||value< -99||value>100))throw Error('Use an adjustment between -99% and 100%.');
 const rows=[];for(let day=start;day<=end;day=addDay(day)){if(!weekdays.includes(new Date(day+'T12:00:00Z').getUTCDay()))continue;const old=nightRate(p,day,rates);const cents=mode==='clear'?Number(baseRate(p,day)):mode==='set'?value:Math.round(old.cents*(1+value/100));if(mode!=='clear'&&(cents<floor||cents>ceiling))throw Error(`${day} falls outside your price limits. Adjust the price or limits.`);rows.push({...old,nextCents:cents,nextGuestCents:Math.round(cents*(1+Number(p.markup_percent)/100))});}
 if(!rows.length)throw Error('No dates match the selected weekdays.');
 return {rows,expected:Object.fromEntries(rows.map(r=>[r.day,r.cents]))};
}
export function marketAdvice(p,comps,arrival,departure,guests,today=todayInZone(p.timezone)){
 if(!validDay(today))throw Error('Use a valid observation date.');
 if(!p.market.trim()||p.accommodation_type==='unspecified')return {reason:'Save your market and accommodation type first.',eligible:[]};
 try{nights(arrival,departure);}catch{return {reason:'Choose arrival and departure dates to compare.',eligible:[]};}
 const earliest=addDay(today,-30),seen=new Set();
 const eligible=comps.filter(c=>c.property_id===p.id&&c.market.trim().toLowerCase()===p.market.trim().toLowerCase()&&c.accommodation_type===p.accommodation_type&&Number(c.guests)===Number(guests)&&c.arrival===arrival&&c.departure===departure&&c.observed_on>=earliest&&c.observed_on<=today&&/^https:\/\//.test(c.source_url)&&Number(c.nightly_cents)>=100&&Number(c.nightly_cents)<=1000000).sort((a,b)=>b.observed_on.localeCompare(a.observed_on)).filter(c=>{const key=c.source_url.replace(/\/$/,'');if(seen.has(key))return false;seen.add(key);return true;});
 if(eligible.length<3)return {reason:`Add ${3-eligible.length} more distinct comparable sources matching these dates, guests, market and accommodation type, observed within 30 days.`,eligible};
 const vals=eligible.map(c=>Number(c.nightly_cents)).sort((a,b)=>a-b),m=Math.floor(vals.length/2),median=Math.round(vals.length%2?vals[m]:(vals[m-1]+vals[m])/2);
 const baseCents=Math.round(median/(1+Number(p.markup_percent)/100));
 return {eligible,median,low:vals[0],high:vals.at(-1),baseCents,reason:baseCents<100?'Suggested base price is below $1 after markup. Review your settings.':''};
}
