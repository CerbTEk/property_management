import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeAccounts,nativeVault} from '../server/native-accounts.mjs';
import {nativeCallback} from '../server/native-oauth.mjs';
const key='a'.repeat(64),binding='b'.repeat(64);
function fixture(){
 let row=null,transaction=null,changed=false,calls=0;
 const store={read:async()=>row,begin:async(owner,provider,v)=>{row={owner_id:owner,provider,status:'disconnected',revision:'rev'};transaction={...v,owner_id:owner,provider,account_revision:'rev'};return 'rev';},consume:async(owner,provider,state,bind)=>{if(!transaction||transaction.owner_id!==owner||transaction.provider!==provider||transaction.state_hash!==state||transaction.binding_hash!==bind)return null;const result=transaction;transaction=null;return result;},save:async(owner,provider,revision,v)=>{if(changed||row.revision!==revision)return false;row={...row,...v};return true;},disconnect:async()=>{changed=true;transaction=null;row={...row,status:'disconnected',sealed_tokens:null};}};
 const api=nativeAccounts({provider:'tedee',clientId:'synthetic',encryptionKey:key,store,fetcher:async()=>{calls++;return new Response(JSON.stringify({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,token_type:'Bearer'}),{headers:{'Content-Type':'application/json'}});}});
 return {api,store,get row(){return row;},get calls(){return calls;},change(){changed=true;}};
}
test('native vault ciphertext rejects foreign host, provider, app and purpose',async()=>{
 const vault=nativeVault(key,'tedee','app'),sealed=await vault.seal('a','tokens',{refreshToken:'synthetic'});
 assert.equal(sealed.includes('synthetic'),false);assert.equal((await vault.open('a','tokens',sealed)).refreshToken,'synthetic');
 for(const v of [nativeVault(key,'igloohome','app'),nativeVault(key,'tedee','other')])await assert.rejects(()=>v.open('a','tokens',sealed));
 await assert.rejects(()=>vault.open('b','tokens',sealed));await assert.rejects(()=>vault.open('a','authorization',sealed));
});
test('native account grants bind host and browser, consume once, and never return tokens',async()=>{
 const f=fixture(),start=await f.api.begin('a',binding),url=nativeCallback+'?code=synthetic&state='+start.state;
 await assert.rejects(()=>f.api.complete('b',binding,url));await assert.rejects(()=>f.api.complete('a','c'.repeat(64),url));assert.equal(f.calls,0);
 const result=await f.api.complete('a',binding,url);assert.equal(result.connected,true);assert.equal(JSON.stringify(result).includes('synthetic-access'),false);assert.equal(f.row.sealed_tokens.includes('synthetic-access'),false);
 await assert.rejects(()=>f.api.complete('a',binding,url));assert.equal(f.calls,1);assert.equal((await f.api.status('a')).inventoryReady,true);
});
test('native disconnect invalidates pending grants and completion cannot overwrite changed accounts',async()=>{
 const f=fixture(),start=await f.api.begin('a',binding),url=nativeCallback+'?code=x&state='+start.state;
 f.change();await assert.rejects(()=>f.api.complete('a',binding,url),e=>e.code==='connection_changed');assert.equal(f.row.status,'disconnected');
 const other=fixture(),pending=await other.api.begin('a',binding);await other.api.disconnect('a');await assert.rejects(()=>other.api.complete('a',binding,nativeCallback+'?code=x&state='+pending.state));assert.equal(other.calls,0);
});
test('native connection refuses missing application credentials without a provider call',async()=>{
 const f=fixture(),api=nativeAccounts({provider:'tedee',store:f.store});assert.equal((await api.status('a')).configured,false);await assert.rejects(()=>api.begin('a',binding),e=>e.code==='not_configured');assert.equal(f.calls,0);
});

test('native renewal rotates encrypted tokens and excludes concurrent refresh',async()=>{
 const f=fixture(),start=await f.api.begin('a',binding);await f.api.complete('a',binding,nativeCallback+'?code=x&state='+start.state);
 const vault=nativeVault(key,'tedee','synthetic');
 f.row.sealed_tokens=await vault.seal('a','tokens',{accessToken:'old-access',refreshToken:'old-refresh',expiresAt:new Date(Date.now()-1000).toISOString()});
 let leased=false;
 f.store.claimRefresh=async()=>{if(leased)return null;leased=true;f.row.revision='renewed';return {...f.row};};
 f.store.finishRefresh=async(owner,provider,rev,values)=>{if(f.row.revision!==rev)return false;Object.assign(f.row,values);return true;};
 const attempts=await Promise.allSettled([f.api.access('a'),f.api.access('a')]);assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(f.calls,2);assert.equal((await vault.open('a','tokens',f.row.sealed_tokens)).refreshToken,'synthetic-refresh');
});
test('native renewal refuses a stale save after disconnect',async()=>{
 const f=fixture(),start=await f.api.begin('a',binding);await f.api.complete('a',binding,nativeCallback+'?code=x&state='+start.state);
 f.row.sealed_tokens=await nativeVault(key,'tedee','synthetic').seal('a','tokens',{accessToken:'old',refreshToken:'refresh',expiresAt:new Date(Date.now()-1000).toISOString()});
 f.store.claimRefresh=async()=>({...f.row});f.store.finishRefresh=async()=>false;
 await assert.rejects(()=>f.api.access('a'),e=>e.code==='connection_changed');
});
