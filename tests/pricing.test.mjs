import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pricePreview,marketAdvice,priceCalendar,todayInZone} from '../src/pricing-model.mjs';
const p={id:'p',weekday_cents:5600,weekend_cents:7000,markup_percent:18.34,timezone:'America/New_York',market:'Garner, NC',accommodation_type:'private_room'};
test('single date, inclusive date ranges, weekday filters and existing overrides',()=>{
 const rates=[{property_id:'p',day:'2026-10-10',amount_cents:8000},{property_id:'foreign',day:'2026-10-09',amount_cents:100}];
 const edit={start:'2026-10-09',end:'2026-10-12',weekdays:[5,6],mode:'percent',value:-10};
 const result=pricePreview(p,rates,edit);
 assert.deepEqual(result.rows.map(r=>[r.day,r.cents,r.nextCents]),[['2026-10-09',7000,6300],['2026-10-10',8000,7200]]);
 assert.deepEqual(result.expected,{'2026-10-09':7000,'2026-10-10':8000});
 assert.equal(pricePreview(p,rates,{...edit,start:'2026-10-10',end:'2026-10-10',mode:'clear'}).rows[0].nextCents,7000);
 assert.equal(pricePreview(p,rates,{...edit,mode:'set',value:9900}).rows[0].nextGuestCents,11716);
 assert.equal(pricePreview(p,[],{...edit,start:'2028-01-01',end:'2028-12-31',weekdays:[0,1,2,3,4,5,6],mode:'set',value:100}).rows.length,366);
 for(const change of [{start:'2026-02-30'},{end:'2026-10-08'},{weekdays:[]},{weekdays:[7]},{value:Infinity},{value:-100},{floor:8000},{ceiling:5000}])assert.throws(()=>pricePreview(p,rates,{...edit,...change}));
});
test('pricing calendar marks overrides and occupancy without exposing another listing',()=>{
 const grid=priceCalendar(p,'2026-10',[{property_id:'p',day:'2026-10-09',amount_cents:9000}],[{property_id:'p',arrival:'2026-10-09',departure:'2026-10-11',kind:'block',status:'blocked'},{property_id:'x',arrival:'2026-10-08',departure:'2026-10-09',status:'confirmed'}]);
 assert.equal(grid.days.length,31);assert.equal(grid.days[8].cents,9000);assert.equal(grid.days[8].override,true);assert.equal(grid.days[8].bookings[0].kind,'block');assert.equal(grid.days[10].bookings.length,0);assert.equal(grid.days[7].bookings.length,0);
 assert.equal(todayInZone('America/New_York',new Date('2026-10-07T01:00:00Z')),'2026-10-06');
});
const comp=(n,changes={})=>({id:String(n),property_id:'p',market:'Garner, NC',accommodation_type:'private_room',guests:2,arrival:'2026-10-09',departure:'2026-10-12',observed_on:'2026-10-06',source_url:`https://example.com/rooms/${n}`,nightly_cents:n*1000,...changes});
test('area advice requires three distinct recent exact-match observations and adjusts for markup',()=>{
 const comps=[comp(8),comp(9),comp(10),comp(50,{property_id:'foreign'}),comp(51,{accommodation_type:'entire_place'}),comp(52,{guests:3}),comp(53,{market:'Raleigh'}),comp(54,{departure:'2026-10-13'}),comp(55,{observed_on:'2026-09-05'}),comp(56,{observed_on:'2026-10-07'}),comp(57,{source_url:'https://example.com/rooms/8'})];
 const a=marketAdvice(p,comps,'2026-10-09','2026-10-12',2,'2026-10-06');
 assert.equal(a.eligible.length,3);assert.equal(a.median,9000);assert.equal(a.baseCents,7605);assert.equal(a.low,8000);assert.equal(a.high,10000);
 assert.equal(marketAdvice(p,[comp(8),comp(9)],'2026-10-09','2026-10-12',2,'2026-10-06').median,undefined);
 assert.match(marketAdvice({...p,market:''},comps,'2026-10-09','2026-10-12',2,'2026-10-06').reason,/Save your market/);
 assert.equal(marketAdvice(p,comps,'2026-10-09','2026-10-09',2,'2026-10-06').median,undefined);
});
