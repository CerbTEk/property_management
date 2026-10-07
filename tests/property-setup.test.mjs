import {test} from 'node:test';
import assert from 'node:assert/strict';
import {propertySetup} from '../src/property-setup.mjs';
const owner='host',now=Date.parse('2026-10-06T20:00:00Z');
const property={id:'p',owner_id:owner,name:'Room A',timezone:'America/New_York',check_in:'15:00:00',check_out:'11:00:00',max_guests:2,min_stay:1,weekday_cents:5600,weekend_cents:7000,markup_percent:'18.34'};
const display={owner_id:owner,property_id:'p',title:'Welcome, {{guest}}',welcome:'Enjoy your stay.',contact:'Contact the host.',house_rules:'Quiet after 10pm.',personalize:true,music_enabled:true};
const device={id:'d',owner_id:owner,property_id:'p',revoked:false,expires_at:null,pairing_expires_at:null};
const lock={id:'l',owner_id:owner,enabled:true};
const data={properties:[property],displays:[display],displayDevices:[device],locks:[lock],lockAssignments:[{owner_id:owner,property_id:'p',lock_id:'l'}],displayImages:[{owner_id:owner,property_id:'p'}]};
test('saved setup can complete without claiming online TVs or installed door codes',()=>{
 const [r]=propertySetup(data,owner,now);assert.equal(r.completed,7);assert.equal(r.total,7);assert.equal(r.next,null);assert.equal(r.photos,1);assert.equal(r.musicEnabled,true);assert.equal('liveReady' in r,false);
 const [empty]=propertySetup({properties:[property]},owner,now);assert.equal(empty.completed,2);assert.equal(empty.next.id,'welcome');
});
test('foreign properties and related settings cannot advance host setup',()=>{
 const foreign={...data,properties:[property,{...property,id:'other',owner_id:'other'}],displays:[{...display,owner_id:'other'}],displayDevices:[{...device,owner_id:'other'}],locks:[{...lock,owner_id:'other'}],displayImages:[{...data.displayImages[0],owner_id:'other'}]};
 const rows=propertySetup(foreign,owner,now);assert.equal(rows.length,1);assert.equal(rows[0].completed,2);assert.equal(rows[0].photos,0);
});
test('pending, expired, revoked TVs and disabled or unassigned locks need setup',()=>{
 for(const d of [{...device,revoked:true},{...device,expires_at:new Date(now).toISOString()},{...device,pairing_expires_at:'2026-01-01T00:00:00Z'},{...device,property_id:'another'}])assert.equal(propertySetup({...data,displayDevices:[d]},owner,now)[0].steps.find(s=>s.id==='screens').done,false);
 assert.equal(propertySetup({...data,locks:[{...lock,enabled:false}]},owner,now)[0].steps.find(s=>s.id==='locks').done,false);
 assert.equal(propertySetup({...data,lockAssignments:[]},owner,now)[0].steps.find(s=>s.id==='locks').done,false);
});
test('malformed listing clocks, timezone, rates and empty welcome settings remain actionable',()=>{
 const [r]=propertySetup({...data,properties:[{...property,timezone:'not-a-timezone',check_in:'25:00',weekday_cents:0,markup_percent:null}],displays:[{...display,welcome:' ',house_rules:' ',title:'Welcome'}]},owner,now);
 for(const id of ['details','pricing','welcome','rules','personalize'])assert.equal(r.steps.find(s=>s.id===id).done,false);
 assert.equal(r.next.id,'details');assert.throws(()=>propertySetup(data,'',now),/owner/);
});
