import {test} from 'node:test';
import assert from 'node:assert/strict';
import {operationsBoard} from '../src/operations-model.mjs';
const p={id:'p',owner_id:'host',name:'Room',timezone:'America/New_York'};
const task={id:'t',owner_id:'host',property_id:'p',due_day:'2026-10-06',status:'open'};
test('operations due days follow listing timezone, exclude foreign tasks and retain completion history',()=>{
 const r=operationsBoard({properties:[p],tasks:[task,{...task,id:'foreign',owner_id:'other'},{...task,id:'done',status:'done',due_day:'2026-01-01'}]},'host',Date.parse('2026-10-07T01:00:00Z'));
 assert.equal(r.rows.length,2);assert.equal(r.counts.today,1);assert.equal(r.counts.overdue,0);assert.equal(r.counts.open,1);
 assert.equal(operationsBoard({properties:[p],tasks:[task]},'host',Date.parse('2026-10-07T12:00:00Z')).counts.overdue,1);
});
test('cancelled, missing and foreign bookings require review without auto-completing work',()=>{
 for(const reservations of [[],[{id:'b',owner_id:'host',status:'cancelled',guest:'Test'}],[{id:'b',owner_id:'other',status:'confirmed',guest:'Foreign'}]]){
  const r=operationsBoard({properties:[p],tasks:[{...task,booking_id:'b'}],reservations},'host',Date.parse('2026-10-06T12:00:00Z'));
  assert.equal(r.counts.review,1);assert.equal(r.rows[0].status,'open');assert.notEqual(r.rows[0].guest,'Foreign');
 }
});
test('reminders flag inactive assignments and respect seven local calendar days across clock changes',()=>{
 const data={properties:[p],operationsPeople:[{id:'active',owner_id:'host',name:'Cleaner',active:true},{id:'inactive',owner_id:'host',active:false},{id:'foreign',owner_id:'other',active:true}],tasks:[{...task,id:'assigned',assignee_id:'active',assignee_name:'Cleaner snapshot',due_day:'2026-11-01'},{...task,id:'inactive',assignee_id:'inactive',due_day:'2026-10-26'},{...task,id:'foreign',assignee_id:'foreign',due_day:'2026-10-26'},{...task,id:'far',due_day:'2026-11-02'},{...task,id:'done',status:'done'}]};
 const r=operationsBoard(data,'host',Date.parse('2026-10-26T15:00:00Z'));
 assert.equal(r.counts.upcoming,2);assert.equal(r.counts.review,2);assert.equal(r.counts.unassigned,3);assert.equal(r.rows.find(t=>t.id==='assigned').assigneeLabel,'Cleaner snapshot');assert.equal(r.rows.find(t=>t.id==='foreign').assigneeInactive,true);
});
