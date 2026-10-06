import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeOAuth,nativeCallback} from '../server/native-oauth.mjs';
const now=()=>1700000000000;
function fixture(provider='igloohome',response={access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,token_type:'Bearer'}){
 const requests=[];
 const api=nativeOAuth({provider,clientId:'synthetic-client',clientSecret:'synthetic-secret',now,fetcher:async(url,options)=>{
  requests.push({url:String(url),options});return new Response(JSON.stringify(response),{headers:{'Content-Type':'application/json'}});
 }});
 return {api,requests};
}
test('native manufacturer authorization uses unique state, PKCE and explicit read-only scopes',async()=>{
 for(const provider of ['igloohome','tedee']){
  const {api}=fixture(provider),first=await api.begin('host-a'),second=await api.begin('host-a'),url=new URL(first.url);
  assert.notEqual(first.transaction.state,second.transaction.state);assert.notEqual(first.transaction.verifier,second.transaction.verifier);
  assert.equal(url.searchParams.get('redirect_uri'),nativeCallback);assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(url.searchParams.has('client_secret'),false);assert.equal(url.searchParams.has('code_verifier'),false);
  assert.equal(url.searchParams.get('scope').includes('Lock.Operate'),false);assert.equal(url.searchParams.get('scope').includes('Write'),false);
 }
});
test('native callback denies foreign hosts, expired transactions, altered apps, state and callback origins before token requests',async()=>{
 const {api,requests}=fixture(),{transaction}=await api.begin('host-a');
 const callback=nativeCallback+'?code=synthetic-code&state='+transaction.state;
 for(const [host,record,url] of [['host-b',transaction,callback],['host-a',{...transaction,issuedAt:now()-600000},callback],['host-a',{...transaction,clientId:'other'},callback],['host-a',transaction,callback.replace('treestand-manager.webflow.io','evil.example')],['host-a',transaction,nativeCallback+'?code=x&state=wrong']])await assert.rejects(()=>api.complete(host,record,url));
 assert.equal(requests.length,0);
});
test('native code exchange uses fixed provider endpoint and keeps credentials out of results',async()=>{
 for(const provider of ['igloohome','tedee']){
  const {api,requests}=fixture(provider),{transaction}=await api.begin('host-a');
  const result=await api.complete('host-a',transaction,nativeCallback+'?code=synthetic-code&state='+transaction.state);
  assert.equal(result.accessToken,'synthetic-access');assert.equal(result.expiresAt,new Date(now()+3600000).toISOString());
  const body=new URLSearchParams(requests[0].options.body);assert.equal(body.get('grant_type'),'authorization_code');assert.equal(body.get('code_verifier'),transaction.verifier);
  assert.equal(requests[0].options.redirect,'error');assert.equal(JSON.stringify(result).includes('synthetic-secret'),false);
 }
});
test('native refresh supports rotation and missing new refresh token, and sanitizes provider errors',async()=>{
 const rotated=fixture();assert.equal((await rotated.api.refresh('old-refresh')).refreshToken,'synthetic-refresh');
 const unchanged=fixture('igloohome',{access_token:'new-access',expires_in:3600,token_type:'Bearer'});assert.equal((await unchanged.api.refresh('old-refresh')).refreshToken,'old-refresh');
 const invalid=fixture('tedee',{error:'invalid_grant',error_description:'private provider details'});await assert.rejects(()=>invalid.api.refresh('old'),e=>e.code==='authorization_failed'&&!e.message.includes('private'));
 await assert.rejects(()=>fixture('igloohome',{access_token:'x',refresh_token:'y',expires_in:0,token_type:'Bearer'}).api.refresh('old'));
});
test('native adapters remain unavailable without manufacturer credentials',async()=>{
 const api=nativeOAuth({provider:'igloohome',now});assert.equal(api.status().configured,false);await assert.rejects(()=>api.begin('a'),e=>e.code==='not_configured');
 assert.throws(()=>nativeOAuth({provider:'schlage'}),e=>e.code==='unsupported');
});
