import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,tokenHash} from '../supabase/functions/guest-display/handler.mjs';
test('device endpoint denies missing, guessed, revoked and expired credentials before content reads',async()=>{
 let tables=[];
 const admin={from(table){tables.push(table);return {select(){return this;},eq(){return this;},gt(){return this;},maybeSingle:async()=>({data:null,error:null})};}};
 const handler=createHandler(admin);
 assert.equal((await handler(new Request('https://display'))).status,401);
 assert.equal(tables.length,0);
 assert.equal((await handler(new Request('https://display',{headers:{Authorization:'Bearer '+'a'.repeat(64)}}))).status,401);
 assert.deepEqual(tables,['ts_display_devices']);
 assert.equal((await handler(new Request('https://display',{method:'DELETE'}))).status,405);
});
test('valid device returns only its room welcome content with no-store and owner filters',async()=>{
 const log=[];
 const admin={from(table){const chain={select(fields){log.push([table,'select',fields]);return this;},eq(k,v){log.push([table,k,v]);return this;},gt(k,v){log.push([table,k,v]);return this;},order(){return this;},limit:async()=>({data:[],error:null}),async maybeSingle(){return {data:table==='ts_display_devices'?{owner_id:'owner-a',property_id:'room-a'}:{title:'Welcome',welcome:'Hello',guidebook:'Rules',recommendations:'Places',contact:'Host',music_enabled:true,music_default:'evening',music_volume:20}};},async single(){return {data:{name:'Room A',check_in:'15:00',check_out:'11:00'}};}};return chain;}};
 const handler=createHandler(admin);const response=await handler(new Request('https://display',{headers:{Authorization:'Bearer '+'a'.repeat(64)}}));
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const body=await response.json();assert.deepEqual(Object.keys(body),['property','display']);assert.equal(body.display.music_default,'evening');assert.equal(body.display.music_volume,20);
 assert.ok(log.some(x=>x[0]==='ts_display_devices'&&x[1]==='revoked'&&x[2]===false));
 assert.ok(log.some(x=>x[0]==='ts_display_devices'&&x[1]==='expires_at'));
 for(const table of ['ts_properties','ts_guest_displays'])assert.ok(log.some(x=>x[0]===table&&x[1]==='owner_id'&&x[2]==='owner-a'));
 assert.equal(await tokenHash('a'.repeat(64)),'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb');
});

test('personalized endpoint returns only first name and scopes booking reads to device owner and room',async()=>{
 const log=[];
 const admin={from(table){const chain={select(fields){log.push([table,'select',fields]);return this;},eq(k,v){log.push([table,k,v]);return this;},gt(){return this;},lte(){throw Error('Future arrivals must not be excluded');},gte(k,v){log.push([table,k,v]);return this;},order(){return this;},limit:async()=>({data:[],error:null}),async maybeSingle(){return {data:table==='ts_display_devices'?{owner_id:'owner-a',property_id:'room-a'}:{title:'Welcome, {{guest}}',personalize:true,welcome:'Hello',guidebook:'',recommendations:'',contact:''}};},async single(){return {data:{name:'Room A',check_in:'15:00:00',check_out:'11:00:00',timezone:'America/New_York'}};},then(resolve){return Promise.resolve({data:[{guest:'Alex Synthetic',arrival:'2026-10-05',departure:'2026-10-07',status:'confirmed'},{guest:'Jordan Upcoming',arrival:'2026-10-10',departure:'2026-10-12',status:'confirmed'}]}).then(resolve);}};return chain;}};
 const response=await createHandler(admin,()=>new Date('2026-10-05T20:00:00Z'))(new Request('https://display',{headers:{Authorization:'Bearer '+'a'.repeat(64)}}));
 assert.equal(response.status,200);const body=await response.json();assert.equal(body.display.title,'Welcome, Alex');assert.ok(!JSON.stringify(body).includes('Synthetic'));assert.ok(!JSON.stringify(body).includes('owner-a'));
 for(const [key,value] of [['owner_id','owner-a'],['property_id','room-a'],['status','confirmed']])assert.ok(log.some(x=>x[0]==='ts_reservations'&&x[1]===key&&x[2]===value));
 const turnover=await createHandler(admin,()=>new Date('2026-10-07T15:00:00Z'))(new Request('https://display',{headers:{Authorization:'Bearer '+'a'.repeat(64)}}));
 assert.equal(turnover.status,200);
 const nextBody=await turnover.json();assert.equal(nextBody.display.title,'Welcome, Jordan');
 assert.ok(!JSON.stringify(nextBody).includes('Upcoming'));
 assert.ok(log.some(x=>x[0]==='ts_reservations'&&x[1]==='departure'&&x[2]==='2026-10-07'));
});

test('pairing code claim is atomic, single-use, expiring and never returns owner metadata',async()=>{
 let available=true;const filters=[];
 const admin={from(table){assert.equal(table,'ts_display_devices');return {update(v){assert.equal(v.pairing_hash,null);assert.equal(v.pairing_expires_at,null);assert.match(v.token_hash,/^[0-9a-f]{64}$/);return this;},eq(k,v){filters.push([k,v]);return this;},gt(k,v){filters.push([k,v]);return this;},async select(){const data=available?[{id:'screen'}]:[];available=false;return {data};}};}};
 const handler=createHandler(admin);const request=()=>new Request('https://display',{method:'POST',body:JSON.stringify({code:'0123-4567-89AB-CDEF'})});
 const responses=await Promise.all([handler(request()),handler(request())]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,401]);
 const body=await responses.find(r=>r.status===200).json();assert.deepEqual(Object.keys(body),['token']);assert.match(body.token,/^[0-9a-f]{64}$/);
 assert.ok(filters.some(([k,v])=>k==='revoked'&&v===false));assert.ok(filters.some(([k])=>k==='pairing_expires_at'));assert.ok(filters.some(([k])=>k==='expires_at'));
 assert.equal((await handler(new Request('https://display',{method:'POST',body:'invalid-json'}))).status,400);
});
