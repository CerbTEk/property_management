import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mfaState,verifyMfa} from '../src/mfa.mjs';
const auth=(currentLevel,nextLevel,factors=[])=>({mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel,nextLevel}}),listFactors:async()=>({data:{totp:factors}})}});
test('MFA gate requires enrollment, challenges verified factors, and rejects stale assurance',async()=>{
 assert.equal((await mfaState(auth('aal1','aal1'))).mode,'enroll');
 assert.equal((await mfaState(auth('aal1','aal2',[{id:'active',status:'verified'}]))).mode,'challenge');
 assert.equal((await mfaState(auth('aal2','aal1'))).mode,'enroll');
 assert.equal((await mfaState(auth('aal2','aal2'))).mode,'ready');
 const failure={mfa:{getAuthenticatorAssuranceLevel:async()=>({error:Error('unavailable')})}};
 await assert.rejects(()=>mfaState(failure),/unavailable/);
});
test('MFA verification never opens workspace after invalid or failed verification',async()=>{
 const a=auth('aal1','aal2',[{id:'active',status:'verified'}]);let calls=0;
 a.mfa.challengeAndVerify=async()=>{calls++;return {error:Error('Invalid code')}};
 await assert.rejects(()=>verifyMfa(a,'active','abc'),/six-digit/);assert.equal(calls,0);
 await assert.rejects(()=>verifyMfa(a,'active','123456'),/Invalid code/);
 a.mfa.challengeAndVerify=async()=>({});await assert.rejects(()=>verifyMfa(a,'active','123456'),/did not complete/);
 a.mfa.getAuthenticatorAssuranceLevel=async()=>({data:{currentLevel:'aal2',nextLevel:'aal2'}});
 assert.equal((await verifyMfa(a,'active','123456')).mode,'ready');
});
