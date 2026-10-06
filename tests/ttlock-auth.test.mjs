import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tokenVault,ttlockAuth,ttlockAccounts} from '../server/ttlock-auth.mjs';
const key='ab'.repeat(32),clientId='synthetic-app',now=()=>1700000000000;
const tokens={accessToken:'synthetic-access',refreshToken:'synthetic-refresh',uid:'123',expiresAt:new Date(now()+3600000).toISOString()};
test('TTLock token encryption binds ciphertext to host and application',async()=>{
 const vault=tokenVault(key,clientId),sealed=await vault.seal('a',tokens);
 assert.deepEqual(await vault.open('a',sealed),tokens);
 assert.notEqual(await vault.seal('a',tokens),sealed);
 assert.equal(sealed.includes('synthetic'),false);
 for(const other of [tokenVault('cd'.repeat(32),clientId),tokenVault(key,'other-app')])await assert.rejects(()=>other.open('a',sealed));
 await assert.rejects(()=>vault.open('b',sealed));
 await assert.rejects(()=>vault.open('a',sealed.slice(0,-4)+'AAAA'));
});
test('TTLock sends provider-required password digest and supports documented refresh without uid',async()=>{
 const requests=[];
 const api=ttlockAuth({clientId,clientSecret:'synthetic-secret',now,fetcher:async(url,options)=>{
  requests.push({url,values:Object.fromEntries(options.body)});
  return {ok:true,json:async()=>({access_token:'new-access',refresh_token:'new-refresh',expires_in:3600,...(requests.length===1?{uid:123}:{})})};
 }});
 assert.equal((await api.login(' user ','password')).uid,'123');
 assert.equal(requests[0].values.password,'5f4dcc3b5aa765d61d8327deb882cf99');
 assert.equal(requests[0].values.username,'user');
 assert.equal((await api.refresh('synthetic-refresh','123')).uid,'123');
 assert.equal(requests[1].values.grant_type,'refresh_token');
 await assert.rejects(()=>ttlockAuth({clientId,clientSecret:'s',fetcher:async()=>({ok:true,json:async()=>({access_token:'x',refresh_token:'y',expires_in:3600})})}).login('u','p'),e=>e.code==='invalid_response');
});
function fixture({expired=false}={}){
 let row=null,calls=0,allowClaim=true,allowSave=true;
 const store={read:async()=>row,claim:async owner=>allowClaim?{owner_id:owner,revision:row?.revision||'initial'}:null,save:async(owner,revision,values)=>{
  if(!allowSave||(row&&row.revision!==revision))return false;
  row={owner_id:owner,...row,...values,revision:'next-'+calls};return true;
 }};
 const account=ttlockAccounts({clientId,clientSecret:'secret',encryptionKey:key,store,now,fetcher:async()=>{
  calls++;return {ok:true,json:async()=>({access_token:'access-'+calls,refresh_token:'refresh-'+calls,expires_in:expired&&calls===1?10:3600,...(calls===1?{uid:123}:{})})};
 }});
 return {account,store,get row(){return row;},get calls(){return calls;},foreign(){row={...row,owner_id:'b'};},noClaim(){allowClaim=false;},noSave(){allowSave=false;}};
}
test('customer login stores ciphertext, returns no credentials and disconnect destroys stored tokens',async()=>{
 const f=fixture();assert.deepEqual(await f.account.connect('a','username','password'),{connected:true});
 assert.equal(JSON.stringify(f.row).includes('password'),false);
 assert.equal(JSON.stringify(f.row).includes('access-1'),false);
 assert.equal(await f.account.accessToken('a'),'access-1');
 assert.equal(JSON.stringify(await f.account.status('a')).includes('sealed'),false);
 assert.deepEqual(await f.account.disconnect('a'),{connected:false});
 assert.equal(f.row.sealed_tokens,null);await assert.rejects(()=>f.account.accessToken('a'),e=>e.code==='not_connected');
});
test('refresh rotates encrypted tokens and fails closed when disconnected concurrently',async()=>{
 const f=fixture({expired:true});await f.account.connect('a','u','p');
 assert.equal(await f.account.accessToken('a'),'access-2');assert.equal(f.calls,2);
 const race=fixture({expired:true});await race.account.connect('a','u','p');race.noSave();
 await assert.rejects(()=>race.account.accessToken('a'),e=>e.code==='connection_changed');
});
test('foreign connection and rate-limited login never contact TTLock',async()=>{
 const f=fixture();f.noClaim();await assert.rejects(()=>f.account.connect('a','u','p'),e=>e.code==='rate_limit');assert.equal(f.calls,0);
 const other=fixture();await other.account.connect('a','u','p');other.foreign();
 for(const operation of [()=>other.account.status('a'),()=>other.account.accessToken('a'),()=>other.account.disconnect('a')])await assert.rejects(operation,e=>e.code==='ownership');
 assert.equal(other.calls,1);
});
