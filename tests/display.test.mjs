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
 assert.equal((await handler(new Request('https://display',{method:'POST'}))).status,405);
});
test('valid device returns only its room welcome content with no-store and owner filters',async()=>{
 const log=[];
 const admin={from(table){const chain={select(fields){log.push([table,'select',fields]);return this;},eq(k,v){log.push([table,k,v]);return this;},gt(k,v){log.push([table,k,v]);return this;},async maybeSingle(){return {data:table==='ts_display_devices'?{owner_id:'owner-a',property_id:'room-a'}:{title:'Welcome',welcome:'Hello',guidebook:'Rules',recommendations:'Places',contact:'Host'}};},async single(){return {data:{name:'Room A',check_in:'15:00',check_out:'11:00'}};}};return chain;}};
 const handler=createHandler(admin);const response=await handler(new Request('https://display',{headers:{Authorization:'Bearer '+'a'.repeat(64)}}));
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const body=await response.json();assert.deepEqual(Object.keys(body),['property','display']);
 assert.ok(log.some(x=>x[0]==='ts_display_devices'&&x[1]==='revoked'&&x[2]===false));
 assert.ok(log.some(x=>x[0]==='ts_display_devices'&&x[1]==='expires_at'));
 for(const table of ['ts_properties','ts_guest_displays'])assert.ok(log.some(x=>x[0]===table&&x[1]==='owner_id'&&x[2]==='owner-a'));
 assert.equal(await tokenHash('a'.repeat(64)),'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb');
});
