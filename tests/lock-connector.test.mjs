import {test} from 'node:test';
import assert from 'node:assert/strict';
import {invokeLockConnector,connectorLabel} from '../src/lock-connector.mjs';
test('connection setup distinguishes missing key, sandbox, suspended and live states',()=>{
 assert.match(connectorLabel({configured:false}),/server key/);
 assert.match(connectorLabel({configured:true,ready:true,mode:'sandbox'}),/simulated/);
 assert.match(connectorLabel({configured:true,ready:false,mode:'live'}),/suspended/);
 assert.match(connectorLabel({configured:true,ready:true,mode:'live'}),/Live workspace verified/);
});
test('connector surfaces actionable server errors and passes only action and connection ID',async()=>{
 const client={functions:{invoke:async(name,{body})=>{assert.equal(name,'smart-lock-connect');assert.deepEqual(body,{action:'sync',connection_id:'owned-id'});return {data:{imported:2},error:null};}}};
 assert.equal((await invokeLockConnector(client,'sync','owned-id')).imported,2);
 await assert.rejects(()=>invokeLockConnector({functions:{invoke:async()=>({error:{context:{json:async()=>({error:'Finish signing into the lock provider first.',code:'pending'})}}})}},'sync'),e=>e.code==='pending'&&e.message.includes('signing'));
});
