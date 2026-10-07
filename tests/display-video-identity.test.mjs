import test from 'node:test';import assert from 'node:assert/strict';
import {allowedClaims,verifyIdentity,audience} from '../supabase/functions/display-video-worker/identity.mjs';
import {createVideoWorker} from '../supabase/functions/display-video-worker/worker.mjs';
const now=Math.floor(Date.now()/1000);
const claims={iss:'https://token.actions.githubusercontent.com',aud:audience,repository_id:'1406305861',repository_owner_id:'337023550',repository:'CerbTEk/property_management',workflow_ref:'CerbTEk/property_management/.github/workflows/display-video.yml@refs/heads/main',ref:'refs/heads/main',event_name:'schedule',iat:now,nbf:now-10,exp:now+300};
test('only this repository and the approved workflow/ref can access private conversion inputs',()=>{
 assert.equal(allowedClaims(claims,now),true);
 for(const patch of [{repository_id:'other'},{aud:'other'},{repository_owner_id:'other'},{event_name:'pull_request'},{ref:'refs/heads/other'},{workflow_ref:'CerbTEk/property_management/.github/workflows/other.yml@refs/heads/main'},{exp:now-1},{nbf:now+100},{iss:'https://attacker.example'}])assert.equal(allowedClaims({...claims,...patch},now),false);
});
test('identity verifies the RSA signature and rejects forged claims or an unsigned JWT',async()=>{
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const key={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'test-key'};
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const prefix=`${encode({alg:'RS256',kid:'test-key'})}.${encode(claims)}`;
 const signature=Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(prefix))).toString('base64url');
 const fetcher=async()=>({ok:true,json:async()=>({keys:[key]})});
 assert.equal(await verifyIdentity(`${prefix}.${signature}`,fetcher),true);
 assert.equal(await verifyIdentity(`${prefix}.${'a'.repeat(signature.length)}`,fetcher),false);
 assert.equal(await verifyIdentity(`${encode({alg:'none'})}.${encode(claims)}.`,fetcher),false);
});
test('unauthenticated converter requests never read tables or private storage',async()=>{
 let reads=0;const admin={from(){reads++;throw Error('Should not read');}};
 const handler=createVideoWorker(admin,{authenticate:async()=>false});
 const response=await handler(new Request('https://worker',{method:'POST',body:'{"action":"claim"}'}));
 assert.equal(response.status,401);assert.equal(reads,0);
});

