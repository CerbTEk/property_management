import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seamClient,seamBookingCodeBody} from '../server/seam.mjs';
import {codeCompatibility} from '../src/lock-providers.mjs';
const owner='00000000-0000-0000-0000-000000000001',viewId='00000000-0000-0000-0000-000000000002',account='00000000-0000-0000-0000-000000000003',deviceId='00000000-0000-0000-0000-000000000004';
const view={connect_webview_id:viewId,customer_key:owner,connected_account_id:account,login_successful:true,selected_provider:'yale',url:'https://connect.getseam.com/connect_webviews/view'};
const device={device_id:deviceId,connected_account_id:account,display_name:'Synthetic Yale',can_program_online_access_codes:true,properties:{online:true,supported_code_lengths:[4,6],address:'private'},secret:'private'};
const client=(respond)=>seamClient({apiKey:'synthetic',fetcher:async(url,options)=>{assert.equal(new URL(url).origin,'https://connect.getseam.com');assert.equal(options.redirect,'error');return {ok:true,json:async()=>respond(new URL(url),options)};}});
test('Seam authorization uses owner-scoped customer and an explicit provider list',async()=>{
 const seam=client((url,options)=>{const body=JSON.parse(options.body);assert.equal(body.customer_key,owner);assert.equal(body.any_provider_allowed,false);assert.ok(body.accepted_providers.includes('schlage'));return {connect_webview:view};});
 assert.equal((await seam.connect(owner)).id,viewId);
 await assert.rejects(()=>client(()=>({connect_webview:{...view,customer_key:account}})).connect(owner),e=>e.code==='ownership');
 await assert.rejects(()=>client(()=>({connect_webview:{...view,url:'https://evil.example'}})).connect(owner),e=>e.code==='invalid_response');
 await assert.rejects(()=>seamClient({}).connect(owner),e=>e.code==='not_configured');
});
test('Seam inventory checks customer, account and device ownership and strips raw data',async()=>{
 const seam=client(url=>url.pathname.endsWith('/get')?{connect_webview:view}:{devices:[device],pagination:{has_next_page:false}});
 const locks=await seam.inventory(owner,viewId);assert.equal(locks[0].brand,'yale');assert.deepEqual(locks[0].capabilities.code_lengths,[4,6]);assert.equal('secret' in locks[0],false);assert.equal('properties' in locks[0],false);
 for(const changed of [{customer_key:account},{connect_webview_id:account},{login_successful:false}])await assert.rejects(()=>client(()=>({connect_webview:{...view,...changed}})).inventory(owner,viewId));
 await assert.rejects(()=>client(url=>url.pathname.endsWith('/get')?{connect_webview:view}:{devices:[{...device,connected_account_id:owner}]}).inventory(owner,viewId),e=>e.code==='ownership');
});
test('inventory pagination stays on fixed API origin and rejects a missing cursor',async()=>{
 let pages=0;
 const seam=client(url=>{if(url.pathname.endsWith('/get'))return {connect_webview:view};pages++;if(pages===1)return {devices:[device],pagination:{has_next_page:true,next_page_cursor:'safe',next_page_url:'https://evil.example'}};assert.equal(url.searchParams.get('page_cursor'),'safe');return {devices:[],pagination:{has_next_page:false}};});
 assert.equal((await seam.inventory(owner,viewId)).length,1);assert.equal(pages,2);
 await assert.rejects(()=>client(url=>url.pathname.endsWith('/get')?{connect_webview:view}:{devices:[],pagination:{has_next_page:true}}).inventory(owner,viewId),e=>e.code==='invalid_response');
});
test('Seam booking request preserves phone suffix and refuses incompatible, unknown and offline devices',()=>{
 const property={id:'room',owner_id:owner,timezone:'UTC',check_in:'15:00',check_out:'11:00'},booking={id:'stay',owner_id:owner,property_id:'room',status:'confirmed',arrival:'2026-10-05',departure:'2026-10-07',guest_phone_last4:'0042'};
 const lock={id:'lock',owner_id:owner,provider:'seam',provider_device_id:deviceId,brand:'yale',enabled:true,online:true,capabilities:{online_codes:true,code_lengths:[4]}};
 const args={property,booking,locks:[lock],assignments:[{owner_id:owner,property_id:'room',lock_id:'lock',purpose:'room'}],lockRecordId:'lock',now:1};
 const body=seamBookingCodeBody(args);assert.equal(body.code,'0042');assert.equal(body.attempt_for_offline_device,false);assert.equal(body.use_backup_access_code_pool,false);
 for(const change of [{brand:'nuki'},{online:false},{capabilities:{}},{capabilities:{online_codes:true,code_lengths:[6]}}])assert.throws(()=>seamBookingCodeBody({...args,locks:[{...lock,...change}]}),e=>e.code==='needs_review');
 assert.throws(()=>seamBookingCodeBody({...args,lockRecordId:'foreign'}),e=>e.code==='not_assigned');
 assert.match(codeCompatibility({provider:'nuki'}),/six digits/);
});
