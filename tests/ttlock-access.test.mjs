import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ttlockAccess} from '../server/ttlock-access.mjs';
import {accessCodeTag} from '../server/access-lifecycle.mjs';
const now=Date.parse('2026-10-06T19:00:00Z'),secret='ab'.repeat(32),receiptId='00000000-0000-0000-0000-000000000001';
function fixture(overrides={}){
 const calls=[],values={
  'lock/list':{list:[{lockId:123,keyboardPwdVersion:4,hasGateway:1}]},'gateway/list':{list:[{gatewayId:789,isOnline:1}]},
  'gateway/listByLock':{list:[{gatewayId:789}]},'lock/queryOpenState':{state:0},
  'lock/listKeyboardPwd':{list:[{keyboardPwdId:456,lockId:123,keyboardPwd:'0042',keyboardPwdName:'Treestand '+receiptId,keyboardPwdType:3,startDate:now,endDate:now+60000,senderUsername:'private'}]},
  'keyboardPwd/add':{keyboardPwdId:456},'keyboardPwd/change':{errcode:0},'keyboardPwd/delete':{errcode:0},...overrides};
 const api=ttlockAccess({clientId:'synthetic-client',accessToken:'synthetic-token',ownerId:'owner',fingerprintKey:secret,now:()=>now,
  fetcher:async(url,options)=>{assert.equal(options.redirect,'error');assert.ok(url.startsWith('https://api.sciener.com/v3/'));const path=url.split('/v3/')[1];calls.push({path,body:options.body});return {ok:true,json:async()=>values[path]};}});
 return {api,calls};
}
test('TTLock preflight verifies owning inventory, associated online gateway, V4 codes and read-only reachability',async()=>{
 const {api,calls}=fixture();const o=await api.observe('123');assert.equal(o.timed_codes,true);assert.equal(o.gateway_online,true);assert.equal(o.owner_id,'owner');assert.equal(calls.some(c=>c.path.includes('keyboardPwd/')),false);
 await assert.rejects(()=>api.observe('124'),e=>e.code==='ownership');
 for(const overrides of [{'gateway/list':{list:[{gatewayId:789,isOnline:0}]}},{'gateway/listByLock':{list:[{gatewayId:888}]}},{'lock/queryOpenState':{state:2}},{'lock/list':{list:[{lockId:123,keyboardPwdVersion:3,hasGateway:1}]}}])assert.equal((await fixture(overrides).api.observe('123')).timed_codes,false);
});
test('TTLock passcode reconciliation returns protected tags and strips PINs and usernames',async()=>{
 const {api}=fixture(),codes=await api.passcodes('123');assert.equal(codes[0].code_tag,await accessCodeTag(secret,'owner','ttlock','123','0042'));assert.equal(JSON.stringify(codes).includes('0042'),false);assert.equal(JSON.stringify(codes).includes('private'),false);
 const foreign=fixture({'lock/listKeyboardPwd':{list:[{keyboardPwdId:456,lockId:999,keyboardPwd:'0042',startDate:now,endDate:now+1000}]}});await assert.rejects(()=>foreign.api.passcodes('123'),e=>e.code==='invalid_response');
 const duplicate=fixture({'lock/listKeyboardPwd':{list:Array(2).fill({keyboardPwdId:456,lockId:123,keyboardPwd:'0042',startDate:now,endDate:now+1000})}});await assert.rejects(()=>duplicate.api.passcodes('123'),e=>e.code==='invalid_response');
});
test('native TTLock mutations use gateway methods, explicit windows and unique receipt labels',async()=>{
 const {api,calls}=fixture(),grant={lockId:'123',providerCodeId:'456',code:'0042',start:now,end:now+60000,receiptId};
 assert.deepEqual(await api.create(grant),{provider_code_id:'456'});assert.equal(calls.at(-1).body.get('keyboardPwd'),'0042');assert.equal(calls.at(-1).body.get('addType'),'2');assert.equal(calls.at(-1).body.get('keyboardPwdType'),'3');assert.equal(calls.at(-1).body.get('keyboardPwdName'),'Treestand '+receiptId);
 await api.update(grant);assert.equal(calls.at(-1).body.get('changeType'),'2');assert.equal(calls.at(-1).body.get('newKeyboardPwd'),'0042');
 await api.revoke(grant);assert.equal(calls.at(-1).body.get('deleteType'),'2');assert.equal(calls.at(-1).body.get('keyboardPwdId'),'456');
 await assert.rejects(()=>api.create({...grant,end:now-1}),e=>e.code==='invalid');await assert.rejects(()=>api.revoke({...grant,providerCodeId:'invalid'}),e=>e.code==='invalid');
});
test('TTLock timeout or malformed write outcome is uncertain and provider errors never leak raw content',async()=>{
 const api=ttlockAccess({clientId:'synthetic',accessToken:'synthetic',ownerId:'owner',now:()=>now,fetcher:async()=>{throw Error('private token');}});
 await assert.rejects(()=>api.revoke({lockId:'123',providerCodeId:'456'}),e=>e.code==='outcome_unknown'&&!e.message.includes('private'));
 const malformed=fixture({'keyboardPwd/add':{}});await assert.rejects(()=>malformed.api.create({lockId:'123',code:'0042',start:now,end:now+1000,receiptId}),e=>e.code==='outcome_unknown');
 const rejected=fixture({'keyboardPwd/delete':{errcode:-1,errmsg:'private token'}});await assert.rejects(()=>rejected.api.revoke({lockId:'123',providerCodeId:'456'}),e=>e.code==='provider_error'&&!e.message.includes('private'));
});
