import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accessReadiness} from '../src/access-readiness.mjs';
import {guestAccessPlan} from '../src/lock-model.mjs';
const owner='host';
const property={id:'p',owner_id:owner,name:'Room A',timezone:'America/New_York',check_in:'15:00',check_out:'11:00'};
const booking={id:'r',owner_id:owner,property_id:'p',guest:'Synthetic guest',guest_phone_last4:'0042',arrival:'2026-10-06',departure:'2026-10-08',status:'confirmed',kind:'booking'};
const lock={id:'l',owner_id:owner,enabled:true,name:'Room lock',brand:'ttlock',provider:'ttlock'};
const assignment={owner_id:owner,property_id:'p',lock_id:'l',purpose:'room'};
const data={properties:[property],reservations:[booking],locks:[lock],lockAssignments:[assignment]};
const now=Date.parse('2026-10-06T12:00:00Z');
test('readiness excludes completed/cancelled/blocked/foreign stays and never exposes PINs',()=>{
 const result=accessReadiness({...data,reservations:[booking,{...booking,id:'past',arrival:'2026-10-01',departure:'2026-10-03'},{...booking,id:'cancelled',status:'cancelled'},{...booking,id:'block',kind:'block'},{...booking,id:'foreign',owner_id:'other'}]},owner,{now});
 assert.equal(result.rows.length,1);assert.equal(result.draftCount,1);assert.equal(result.rows[0].state,'draft_ready');assert.equal(result.rows[0].stayState,'upcoming');assert.equal('code' in result.rows[0],false);assert.equal(JSON.stringify(result).includes('0042'),false);
 assert.equal(accessReadiness(data,owner,{now:Date.parse('2026-10-07T12:00:00Z')}).inStayCount,1);
 assert.equal(accessReadiness(data,owner,{now:Date.parse('2026-10-08T15:00:00Z')}).rows.length,0);
});
test('unassigned, disabled and foreign locks block guest access planning',()=>{
 for(const locks of [[],[{...lock,enabled:false}],[{...lock,owner_id:'other'}]]){
  const result=accessReadiness({...data,locks},owner,{now});assert.equal(result.reviewCount,1);assert.match(result.rows[0].issues.join(' '),/No enabled lock/);
  assert.equal(guestAccessPlan(property,booking,locks,[assignment]).status,'needs_review');
 }
});
test('bad dates, missing phone, device compatibility and shared PIN conflicts remain visible',()=>{
 const bad=accessReadiness({...data,reservations:[{...booking,arrival:'2026-10-10',departure:'2026-10-09'}]},owner,{now});assert.equal(bad.reviewCount,1);assert.equal(bad.rows[0].stayState,'unverified');
 const malformedPast=accessReadiness({...data,reservations:[{...booking,arrival:'not-a-date',departure:'2026-10-01'}]},owner,{now});assert.equal(malformedPast.reviewCount,1);
 const missing=accessReadiness({...data,reservations:[{...booking,guest_phone_last4:null}]},owner,{now});assert.equal(missing.reviewCount,1);
 const native=accessReadiness({...data,locks:[{...lock,brand:'tedee',provider:'tedee',capabilities:{}}]},owner,{now});assert.match(native.rows[0].issues.join(' '),/not been verified/);
 const conflict=accessReadiness({...data,reservations:[booking,{...booking,id:'second'}]},owner,{now});assert.equal(conflict.reviewCount,2);assert.match(conflict.rows[0].issues.join(' '),/overlapping booking/);
});
