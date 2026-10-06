import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeInventory} from '../server/native-inventory.mjs';
import {codeCompatibility} from '../src/lock-providers.mjs';
const response=v=>new Response(JSON.stringify(v));
test('native Tedee inventory imports only sanitized account locks without asserting PIN readiness',async()=>{
 const calls=[],api=nativeInventory({provider:'tedee',accessToken:'synthetic',fetcher:async(url,opts)=>{calls.push({url,opts});return response({success:true,result:[{id:123,name:'Room A',isConnected:true,serialNumber:'private',userSettings:{location:{latitude:1}},deviceSettings:{},accessDetails:'private'}]});}});
 const {locks}=await api.list();assert.equal(locks[0].provider_device_id,'123');assert.equal(locks[0].online,true);assert.deepEqual(locks[0].capabilities,{});assert.equal(JSON.stringify(locks).includes('private'),false);assert.ok(codeCompatibility(locks[0],'00042'));
 assert.equal(new URL(calls[0].url).origin,'https://api.tedee.com');assert.equal(calls[0].opts.redirect,'error');assert.equal(calls[0].opts.method,'GET');
});
test('igloohome pagination stays on its fixed origin and excludes accessories and secrets',async()=>{
 const calls=[],api=nativeInventory({provider:'igloohome',accessToken:'synthetic',fetcher:async(url)=>{calls.push(url);return response(calls.length===1?{nextCursor:'https://evil.example',payload:[{deviceId:'LOCK1',deviceName:'Front',type:'Lock',adminKey:'private',masterPin:'private'},{deviceId:'KEY1',type:'Keypad'}]}:{nextCursor:'',payload:[{deviceId:'LOCK2',deviceName:'Room',type:'Lock'}]});}});
 const result=await api.list();assert.equal(result.locks.length,2);assert.equal(result.ignored,1);assert.equal(result.locks[0].online,null);assert.equal(JSON.stringify(result).includes('private'),false);assert.equal(new URL(calls[1]).origin,'https://api.igloohome.co');assert.equal(new URL(calls[1]).searchParams.get('cursor'),'https://evil.example');
});
test('native inventory rejects repeated IDs, cursors, incomplete payloads and provider errors',async()=>{
 for(const value of [{nextCursor:'',payload:[{deviceId:'x',type:'Lock'},{deviceId:'x',type:'Lock'}]},{payload:[]},{nextCursor:'same',payload:[{deviceId:'x',type:'Lock'}]}])await assert.rejects(()=>nativeInventory({provider:'igloohome',accessToken:'x',fetcher:async()=>response(value)}).list());
 await assert.rejects(()=>nativeInventory({provider:'tedee',accessToken:'x',fetcher:async()=>response({success:false,result:[]})}).list());
 for(const [status,code] of [[401,'authorization_failed'],[402,'subscription_required'],[429,'rate_limit'],[500,'unavailable']])await assert.rejects(()=>nativeInventory({provider:'igloohome',accessToken:'x',fetcher:async()=>new Response('private',{status})}).list(),e=>e.code===code&&!e.message.includes('private'));
});
