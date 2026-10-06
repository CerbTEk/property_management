import {test} from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {paymentConfig,stripePayments,merchantStatus} from '../server/stripe-payments.mjs';
import {paymentsHandler,stripeWebhookHandler} from '../server/payments-handler.mjs';
import {paymentRedirect,onboardingRedirect} from '../src/payments-client.mjs';
const time=Date.now();
const config={configured:true,key:'unused',publishableKey:'pk_test_example',platform:'acct_platform',mode:'sandbox',livemode:false,prices:{monthly:'price_month',annual:'price_year'},taxMode:'reviewed_no_tax',billingEnabled:true,origin:'https://treestand-manager.webflow.io'};
function fixture(){
 const row={owner_id:'owner-a',livemode:false,contact_email:'a@example.invalid',creation_key:'creation',created_at:new Date(time).toISOString(),account_id:null};
 const state={row,locked:false,created:0,sessions:0,checkouts:0,subs:[],events:new Set(),snapshots:[],pending:null,failSave:false};
 const store={read:async owner=>owner===row.owner_id?row:null,byAccount:async account=>account===row.account_id?row:null,claim:async(owner,live)=>{assert.equal(owner,'owner-a');assert.equal(live,false);if(state.locked)return null;state.locked=true;return {...row,lease_token:'lease'};},save:async(r,patch)=>{if(state.failSave)return false;Object.assign(row,patch);return true;},release:async()=>{state.locked=false;},subscription:async()=>state.snapshots.at(-1),eventProcessed:async event=>state.events.has(event),saveSubscription:async(r,s)=>{state.snapshots.push(s);return true;},markEvent:async e=>state.events.add(e.id)};
 const subscription={id:'sub_example',customer_account:'acct_host',livemode:false,status:'active',items:{data:[{price:{id:'price_month'},current_period_end:Math.floor(time/1000)+3600}]},cancel_at_period_end:false};
 const stripe={accounts:{retrieve:async()=>({id:'acct_platform'})},v2:{core:{accounts:{create:async(p,o)=>{state.created++;assert.equal(p.dashboard,'full');assert.deepEqual(p.defaults.responsibilities,{fees_collector:'stripe',losses_collector:'stripe'});assert.deepEqual(p.configuration.customer,{});assert.equal(p.identity.entity_type,undefined);assert.equal(o.idempotencyKey,'treestand-account-creation');return {id:'acct_host'};},retrieve:async()=>({configuration:{merchant:{capabilities:{card_payments:{status:'active'}}}}})}}},accountSessions:{create:async p=>{state.sessions++;assert.equal(p.account,'acct_host');assert.equal(p.components.notification_banner.enabled,true);return {client_secret:'temporary'};}},prices:{retrieve:async id=>({id,active:true,livemode:false,currency:'usd',type:'recurring',recurring:{interval:id==='price_month'?'month':'year',interval_count:1,usage_type:'licensed'},billing_scheme:'per_unit',unit_amount:2500,product:{active:true}})},subscriptions:{list:async p=>{assert.equal(p.customer_account,'acct_host');return {data:state.subs,has_more:false};},retrieve:async()=>({...subscription})},tax:{registrations:{list:async()=>({data:[]})}},checkout:{sessions:{create:async(p,o)=>{state.checkouts++;assert.equal(p.customer_account,'acct_host');assert.equal(p.payment_method_types,undefined);assert.equal(p.subscription_data,undefined);assert.deepEqual(p.line_items,[{price:'price_month',quantity:1}]);assert.match(p.integration_identifier,/_subscription_[a-z]{8}$/);assert.match(o.idempotencyKey,/treestand-checkout-/);state.pending={id:'cs_example',url:'https://checkout.stripe.com/c/pay/example',status:'open'};return state.pending;},retrieve:async()=>state.pending}},billingPortal:{sessions:{create:async p=>{assert.equal(p.customer_account,'acct_host');return {url:'https://billing.stripe.com/p/session/example'};}}}};
 return {state,store,stripe,subscription,service:stripePayments({stripe,store,config,now:()=>time})};
}
test('missing account config and mixed keys fail closed; origin may move to permanent HTTPS domain',()=>{
 assert.equal(paymentConfig(()=>undefined).configured,false);
 const values={TREESTAND_STRIPE_API_KEY:'rk_test_example',TREESTAND_STRIPE_PUBLISHABLE_KEY:'pk_test_example',TREESTAND_STRIPE_ACCOUNT_ID:'acct_platform',TREESTAND_APP_ORIGIN:'https://manager.example.com'};
 assert.equal(paymentConfig(n=>values[n]).configured,true);assert.equal(paymentConfig(n=>values[n]).origin,'https://manager.example.com');
 values.TREESTAND_STRIPE_MODE='live';assert.equal(paymentConfig(n=>values[n]).configured,false);
 values.TREESTAND_STRIPE_MODE='sandbox';values.TREESTAND_APP_ORIGIN='https://manager.example.com/path';assert.equal(paymentConfig(n=>values[n]).configured,false);
 assert.equal(merchantStatus({charges_enabled:true}).ready,false);
 assert.throws(()=>paymentRedirect('https://checkout.stripe.com.attacker.invalid/'));
 assert.throws(()=>paymentRedirect('javascript:alert(1)'));
});
test('account creation is reused and always uses the independent host model',async()=>{
 const {state,service}=fixture();await service.accountSession('owner-a','a@example.invalid');await service.accountSession('owner-a','a@example.invalid');assert.equal(state.created,1);assert.equal(state.sessions,2);
 const result=await service.status('owner-a');assert.equal(result.ready,true);assert.equal(result.bookingCheckoutEnabled,false);assert.equal(result.bookingCommission,0);
});
test('hosted onboarding uses the owned account, fixed return URLs and strict Stripe redirect validation',async()=>{
 const f=fixture();let calls=0;
 f.stripe.v2.core.accountLinks={create:async p=>{calls++;assert.equal(p.account,'acct_host');assert.deepEqual(p.use_case,{type:'account_onboarding',account_onboarding:{configurations:['merchant'],refresh_url:config.origin+'/app/?payments=onboarding_refresh',return_url:config.origin+'/app/?payments=onboarding_return'}});return {account:'acct_host',livemode:false,url:'https://connect.stripe.com/setup/test'};}};
 assert.deepEqual(await f.service.onboarding('owner-a','a@example.invalid'),{url:'https://connect.stripe.com/setup/test'});
 await f.service.onboarding('owner-a','a@example.invalid');assert.equal(calls,2);assert.equal(f.state.created,1);assert.equal(f.state.locked,false);
 assert.equal(onboardingRedirect('https://connect.stripe.com/setup/test'),'https://connect.stripe.com/setup/test');
 for(const url of ['https://connect.stripe.com.evil.invalid/setup','https://evil@connect.stripe.com/setup','http://connect.stripe.com/setup','https://connect.stripe.com:444/setup','https://checkout.stripe.com/setup'])assert.throws(()=>onboardingRedirect(url));
 f.stripe.v2.core.accountLinks.create=async()=>({account:'acct_other',livemode:false,url:'https://connect.stripe.com/setup/test'});await assert.rejects(()=>f.service.onboarding('owner-a','a@example.invalid'),/configuration needs review/);assert.equal(f.state.locked,false);
 f.stripe.v2.core.accountLinks.create=async()=>({account:'acct_host',livemode:true,url:'https://connect.stripe.com/setup/test'});await assert.rejects(()=>f.service.onboarding('owner-a','a@example.invalid'),/configuration needs review/);
});
test('host onboarding HTTP action cannot accept caller-supplied account or return URL',async()=>{
 let calls=0;const handler=paymentsHandler({authenticate:async()=>({id:'owner-a',email:'a@example.invalid',aal:'aal2'}),config,service:{onboarding:async(owner,email)=>{calls++;assert.equal(owner,'owner-a');assert.equal(email,'a@example.invalid');return {url:'https://connect.stripe.com/setup/test'};}}});
 const req=body=>new Request(config.origin,{method:'POST',headers:{authorization:'Bearer example'},body:JSON.stringify(body)});
 assert.equal((await handler(req({action:'onboarding',return_url:'https://evil.invalid'}))).status,400);assert.equal(calls,0);
 assert.equal((await handler(req({action:'onboarding',account:'acct_other'}))).status,400);assert.equal(calls,0);
 assert.equal((await handler(req({action:'onboarding'}))).status,200);assert.equal(calls,1);
});
test('subscription checkout reuses pending session and prevents duplicate subscriptions',async()=>{
 const {state,service}=fixture();const one=await service.checkout('owner-a','a@example.invalid','monthly');const two=await service.checkout('owner-a','a@example.invalid','monthly');assert.deepEqual(one,two);assert.equal(state.checkouts,1);
 await assert.rejects(()=>service.checkout('owner-a','a@example.invalid','annual'),/different billing interval/);
 state.subs=[{id:'sub_active',status:'active'}];await assert.rejects(()=>service.checkout('owner-a','a@example.invalid','monthly'),/already have a subscription/);
 assert.equal(state.locked,false);assert.equal(state.checkouts,1);
});
test('completed checkout can be replaced after its subscription is canceled',async()=>{
 const {state,service}=fixture();await service.checkout('owner-a','a@example.invalid','monthly');state.pending={...state.pending,status:'complete',subscription:'sub_old'};state.subs=[{id:'sub_old',status:'canceled'}];await service.checkout('owner-a','a@example.invalid','monthly');assert.equal(state.checkouts,2);
});
test('failed database writes, stale creation, wrong platform and missing tax registrations stop checkout',async()=>{
 let f=fixture();f.state.failSave=true;await assert.rejects(()=>f.service.checkout('owner-a','a@example.invalid','monthly'),/expired/);assert.equal(f.state.checkouts,0);
 f=fixture();f.state.row.created_at=new Date(time-24*3600000).toISOString();await assert.rejects(()=>f.service.accountSession('owner-a','a@example.invalid'),/support review/);assert.equal(f.state.created,0);
 f=fixture();f.stripe.accounts.retrieve=async()=>({id:'acct_foreign'});await assert.rejects(()=>f.service.checkout('owner-a','a@example.invalid','monthly'),/configuration needs review/);
 f=fixture();const taxService=stripePayments({...f,config:{...config,taxMode:'registered_automatic'}});await assert.rejects(()=>taxService.checkout('owner-a','a@example.invalid','monthly'),/tax registration/);assert.equal(f.state.created,0);
 f=fixture();f.state.locked=true;await assert.rejects(()=>f.service.accountSession('owner-a','a@example.invalid'),e=>e.code==='busy');
});
test('webhooks reconcile current subscription, deduplicate, and reject guest/mode/owner events',async()=>{
 const f=fixture();f.state.row.account_id='acct_host';const event={id:'evt_1',type:'invoice.paid',livemode:false,data:{object:{parent:{subscription_details:{subscription:'sub_example'}}}}};
 assert.deepEqual(await f.service.webhook(event),{received:true});assert.equal(f.state.snapshots[0].status,'active');assert.deepEqual(await f.service.webhook(event),{duplicate:true});assert.equal(f.state.snapshots.length,1);
 assert.deepEqual(await f.service.webhook({...event,id:'guest',account:'acct_host'}),{ignored:true});assert.deepEqual(await f.service.webhook({...event,id:'live',livemode:true}),{ignored:true});
 f.subscription.status='canceled';await f.service.webhook({...event,id:'late',type:'customer.subscription.updated',data:{object:{id:'sub_example',status:'active'}}});assert.equal(f.state.snapshots.at(-1).status,'canceled');
 f.subscription.customer_account='acct_unknown';assert.deepEqual(await f.service.webhook({...event,id:'foreign'}),{ignored:true});
});
test('host handler rejects forged IDs, non-MFA and anonymous calls before Stripe',async()=>{
 let calls=0;const service={status:async owner=>{calls++;assert.equal(owner,'owner-a');return {configured:false};}};
 const request=body=>new Request(config.origin,{method:'POST',headers:{authorization:'Bearer example',origin:config.origin},body:JSON.stringify(body)});
 let handler=paymentsHandler({authenticate:async()=>({id:'owner-a',email:'a@example.invalid',aal:'aal2'}),service,config});
 assert.equal((await handler(request({action:'status',account_id:'acct_foreign'}))).status,400);assert.equal(calls,0);
 assert.equal((await handler(request({action:'status'}))).status,200);assert.equal(calls,1);
 handler=paymentsHandler({authenticate:async()=>({id:'owner-a',email:'a@example.invalid',aal:'aal1'}),service,config});assert.equal((await handler(request({action:'status'}))).status,403);
 handler=paymentsHandler({authenticate:async()=>null,service,config});assert.equal((await handler(request({action:'status'}))).status,401);
});
test('raw webhook signatures are mandatory; reconciliation failures invite retries',async()=>{
 const stripe=new Stripe('unused');const secret='fixture-signing-secret',raw=JSON.stringify({id:'evt_example',type:'invoice.paid',livemode:false,data:{object:{}}});
 const signature=stripe.webhooks.generateTestHeaderString({payload:raw,secret});let called=0;
 const handler=stripeWebhookHandler({constructEvent:(body,sig)=>stripe.webhooks.constructEvent(body,sig,secret),livemode:false,service:{webhook:async()=>{called++;throw Error('storage');}}});
 const request=(body,sig)=>new Request('https://example.invalid',{method:'POST',body,headers:{'stripe-signature':sig}});
 assert.equal((await handler(request(raw,signature))).status,500);assert.equal(called,1);
 assert.equal((await handler(request(raw+' ',signature))).status,400);assert.equal(called,1);
 const expired=stripe.webhooks.generateTestHeaderString({payload:raw,secret,timestamp:Math.floor(Date.now()/1000)-600});assert.equal((await handler(request(raw,expired))).status,400);
});
