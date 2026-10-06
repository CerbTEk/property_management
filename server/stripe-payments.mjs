export class PaymentsError extends Error {
 constructor(message,code='unavailable',status=503){super(message);this.code=code;this.status=status;}
}
const include=['configuration.merchant','configuration.customer','requirements'];
const terminal=new Set(['canceled','incomplete_expired']);
const id=x=>typeof x==='string'?x:x?.id;
export function paymentConfig(env){
 const key=env('TREESTAND_STRIPE_API_KEY'),publishableKey=env('TREESTAND_STRIPE_PUBLISHABLE_KEY');
 const mode=env('TREESTAND_STRIPE_MODE')||'sandbox',livemode=mode==='live';
 const platform=env('TREESTAND_STRIPE_ACCOUNT_ID');
 let origin=env('TREESTAND_APP_ORIGIN')||'https://treestand-manager.webflow.io';
 let validOrigin=false;try{const url=new URL(origin);validOrigin=url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&url.pathname==='/'&&!url.search&&!url.hash;origin=url.origin;}catch{}
 const keyMode=livemode?'live':'test';
 const configured=validOrigin&&['sandbox','live'].includes(mode)&&Boolean(platform?.match(/^acct_[A-Za-z0-9]+$/)&&key?.match(new RegExp(`^[rs]k_${keyMode}_`))&&publishableKey?.startsWith(`pk_${keyMode}_`));
 const prices={monthly:env('TREESTAND_STRIPE_MONTHLY_PRICE'),annual:env('TREESTAND_STRIPE_ANNUAL_PRICE')};
 const taxMode=env('TREESTAND_STRIPE_SUBSCRIPTION_TAX_MODE');
 const billingEnabled=configured&&env('TREESTAND_STRIPE_BILLING_ENABLED')==='true'&&Boolean(env('TREESTAND_STRIPE_WEBHOOK_SECRET'))&&['reviewed_no_tax','registered_automatic'].includes(taxMode);
 return {configured,key,publishableKey,platform,mode,livemode,prices,taxMode,billingEnabled,origin};
}
export function merchantStatus(account){
 const card=account?.configuration?.merchant?.capabilities?.card_payments?.status;
 return {cardPayments:card||'not_requested',ready:card==='active',requirements:account?.requirements?.summary?.minimum_deadline?.status||null};
}
export function subscriptionSnapshot(subscription,owner,livemode){
 const item=subscription.items?.data?.[0];
 return {subscription_id:subscription.id,owner_id:owner,livemode,status:subscription.status,price_id:id(item?.price),current_period_end:item?.current_period_end?new Date(item.current_period_end*1000).toISOString():null,cancel_at_period_end:Boolean(subscription.cancel_at_period_end),checked_at:new Date().toISOString()};
}
export function billingSubscriptionId(event){
 const object=event.data?.object;
 if(event.type.startsWith('customer.subscription.'))return id(object);
 if(event.type.startsWith('invoice.'))return id(object?.parent?.subscription_details?.subscription);
 if(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed'].includes(event.type))return id(object?.subscription);
 return null;
}
export function stripePayments({stripe,store,config:c,now=()=>Date.now()}){
 let verified;
 async function verifyPlatform(){
  if(!c.configured)throw new PaymentsError('CerbTek’s Stripe connection is being configured.','not_configured');
  if(!verified)verified=(async()=>{const account=await stripe.accounts.retrieve();if(account.id!==c.platform)throw new PaymentsError('Stripe account configuration needs review.','account_mismatch');})();
  try{await verified;}catch(e){verified=null;throw e;}
 }
 async function locked(owner,email,job){
  const row=await store.claim(owner,c.livemode,email);
  if(!row)throw new PaymentsError('Another payment operation is in progress. Retry shortly.','busy',409);
  try{return await job(row);}finally{await store.release(row);}
 }
 async function persist(row,patch){if(!await store.save(row,patch))throw new PaymentsError('Payment operation expired. Recheck before continuing.','stale',409);Object.assign(row,patch);}
 async function ensureAccount(row){
  if(row.account_id)return row.account_id;
  // Stripe retains idempotency keys for at least 24h. A lost write must be
  // reconciled manually after that window instead of creating another account.
  if(now()-Date.parse(row.created_at)>23*3600000)throw new PaymentsError('An unfinished Stripe connection needs support review.','needs_review');
  const account=await stripe.v2.core.accounts.create({contact_email:row.contact_email,display_name:row.contact_email,dashboard:'full',identity:{country:'US'},defaults:{responsibilities:{fees_collector:'stripe',losses_collector:'stripe'}},configuration:{merchant:{capabilities:{card_payments:{requested:true}}},customer:{}},include},{idempotencyKey:`treestand-account-${row.creation_key}`});
  await persist(row,{account_id:account.id});return account.id;
 }
 async function subscriptions(account){
  const list=await stripe.subscriptions.list({customer_account:account,status:'all',limit:100});
  if(list.has_more)throw new PaymentsError('Subscription history needs review.','needs_review');
  return list.data;
 }
 async function price(interval){
  const priceId=c.prices[interval];
  if(!c.billingEnabled||!/^price_[A-Za-z0-9]+$/.test(priceId||''))throw new PaymentsError('Subscription pricing is not available yet.','pricing_pending');
  const p=await stripe.prices.retrieve(priceId,{expand:['product']});
  if(!p.active||p.product?.deleted||p.product?.active===false||p.livemode!==c.livemode||p.currency!=='usd'||p.type!=='recurring'||p.recurring?.interval!==(interval==='monthly'?'month':'year')||p.recurring?.interval_count!==1||p.recurring?.usage_type!=='licensed'||p.billing_scheme!=='per_unit'||p.transform_quantity||!Number.isSafeInteger(p.unit_amount)||p.unit_amount<=0)throw new PaymentsError('Subscription price configuration needs review.','pricing_pending');
  return p;
 }
 async function status(owner){
  const base={configured:c.configured,mode:c.mode,billingEnabled:c.billingEnabled,bookingCheckoutEnabled:false,bookingCommission:0,plans:[],connected:false,subscription:null};
  if(!c.configured)return base;
  await verifyPlatform();
  for(const interval of ['monthly','annual'])if(c.prices[interval]&&c.billingEnabled){const p=await price(interval);base.plans.push({interval,amount:p.unit_amount,currency:p.currency});}
  const row=await store.read(owner,c.livemode);
  if(row?.account_id){
   const account=await stripe.v2.core.accounts.retrieve(row.account_id,{include});
   Object.assign(base,{connected:true,...merchantStatus(account),dashboardUrl:`https://dashboard.stripe.com/${row.account_id}`,publishableKey:c.publishableKey});
   const saved=await store.subscription(owner,c.livemode);if(saved)base.subscription={status:saved.status,cancelAtPeriodEnd:saved.cancel_at_period_end,currentPeriodEnd:saved.current_period_end,checkedAt:saved.checked_at};
  }
  return base;
 }
 async function onboarding(owner,email){
  await verifyPlatform();
  return locked(owner,email,async row=>{
   const account=await ensureAccount(row);
   const link=await stripe.v2.core.accountLinks.create({account,use_case:{type:'account_onboarding',account_onboarding:{configurations:['merchant','customer'],refresh_url:c.origin+'/app/?payments=onboarding_refresh',return_url:c.origin+'/app/?payments=onboarding_return'}}});
   if(link.account!==account||link.livemode!==c.livemode)throw new PaymentsError('Stripe onboarding configuration needs review.','account_mismatch');
   return {url:link.url};
  });
 }
 async function accountSession(owner,email){
  await verifyPlatform();
  return locked(owner,email,async row=>{
   const account=await ensureAccount(row);
   const components=Object.fromEntries(['account_onboarding','notification_banner','account_management','payments','payouts'].map(x=>[x,{enabled:true}]));
   components.payments.features={refund_management:true,dispute_management:true};
   const session=await stripe.accountSessions.create({account,components});
   return {clientSecret:session.client_secret,publishableKey:c.publishableKey,mode:c.mode};
  });
 }
 async function checkout(owner,email,interval){
  if(!['monthly','annual'].includes(interval))throw new PaymentsError('Choose monthly or annual billing.','invalid_request',400);
  await verifyPlatform();const p=await price(interval);
  if(c.taxMode==='registered_automatic'){
   const registrations=await stripe.tax.registrations.list({status:'active',limit:1});
   if(!registrations.data.length)throw new PaymentsError('Subscription tax registration needs review.','tax_pending');
  }
  return locked(owner,email,async row=>{
   const account=await ensureAccount(row);
   const existing=await subscriptions(account);
   if(existing.some(s=>!terminal.has(s.status)))throw new PaymentsError('You already have a subscription or pending payment. Use Manage subscription.','existing_subscription',409);
   if(row.checkout_id){
    const pending=await stripe.checkout.sessions.retrieve(row.checkout_id);
    if(pending.status==='open'){
     if(row.checkout_interval!==interval)throw new PaymentsError('An existing checkout uses a different billing interval. Complete it or wait for it to expire before changing intervals.','checkout_pending',409);
     return {url:pending.url};
    }
    if(pending.status==='complete'&&!existing.some(s=>s.id===id(pending.subscription)&&terminal.has(s.status)))throw new PaymentsError('Checkout is complete. Payment confirmation is pending; recheck shortly.','checkout_pending',409);
    await persist(row,{checkout_key:null,checkout_started_at:null,checkout_id:null,checkout_interval:null});
   }
   if(!row.checkout_key)await persist(row,{checkout_key:crypto.randomUUID(),checkout_started_at:new Date(now()).toISOString(),checkout_interval:interval});
   if(row.checkout_interval!==interval)throw new PaymentsError('A previous checkout is still being recovered. Retry the same interval.','checkout_pending',409);
   if(now()-Date.parse(row.checkout_started_at)>23*3600000)throw new PaymentsError('An unfinished checkout needs support review.','needs_review');
   const suffix=row.checkout_key.replace(/-/g,'').slice(0,8).replace(/[0-9]/g,n=>'abcdefghij'[Number(n)]);
   const session=await stripe.checkout.sessions.create({mode:'subscription',customer_account:account,line_items:[{price:p.id,quantity:1}],billing_address_collection:'required',automatic_tax:{enabled:c.taxMode==='registered_automatic'},success_url:c.origin+'/app/?payments=return',cancel_url:c.origin+'/app/?payments=cancelled',integration_identifier:`treestand_subscription_${suffix}`},{idempotencyKey:`treestand-checkout-${row.checkout_key}`});
   await persist(row,{checkout_id:session.id});return {url:session.url};
  });
 }
 async function portal(owner){
  await verifyPlatform();const row=await store.read(owner,c.livemode);
  if(!row?.account_id)throw new PaymentsError('No subscription account is connected.','not_connected',409);
  return {url:(await stripe.billingPortal.sessions.create({customer_account:row.account_id,return_url:c.origin+'/app/?payments=return'})).url};
 }
 async function webhook(event){
  // Guest/connected-account events cannot change CerbTek subscription records.
  if(event.livemode!==c.livemode||event.account||event.context&&event.context!==c.platform)return {ignored:true};
  const subId=billingSubscriptionId(event);if(!subId)return {ignored:true};
  await verifyPlatform();
  if(await store.eventProcessed(event.id))return {duplicate:true};
  // Retrieve instead of trusting webhook metadata or possibly stale snapshots.
  const initial=await stripe.subscriptions.retrieve(subId);
  const account=id(initial.customer_account);
  if(!account)return {ignored:true};
  const row=await store.byAccount(account,c.livemode);if(!row)return {ignored:true};
  return locked(row.owner_id,row.contact_email,async lease=>{
   if(await store.eventProcessed(event.id))return {duplicate:true};
   const sub=await stripe.subscriptions.retrieve(subId);
   if(id(sub.customer_account)!==lease.account_id||sub.livemode!==c.livemode)throw new PaymentsError('Subscription account mismatch.','ownership',403);
   const snapshot=subscriptionSnapshot(sub,lease.owner_id,c.livemode);
   if(!Object.values(c.prices).filter(Boolean).includes(snapshot.price_id))return {ignored:true};
   if(!await store.saveSubscription(lease,snapshot))throw new PaymentsError('Subscription reconciliation expired.','busy',409);
   await store.markEvent(event);return {received:true};
  });
 }
 return {status,onboarding,accountSession,checkout,portal,webhook};
}
