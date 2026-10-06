import {PaymentsError} from './stripe-payments.mjs';
export function paymentsHandler({authenticate,service,config}){
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':config.origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
 return async req=>{
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(req.headers.get('origin')&&req.headers.get('origin')!==config.origin)return reply({error:'Origin not allowed.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply({error:'Use POST.'},405);
  try{
   const token=req.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
   if(!token)return reply({error:'Sign in required.'},401);
   const user=await authenticate(token);if(!user)return reply({error:'Sign in required.'},401);
   if(user.id!=='3f03551d-89de-4214-aa7a-db7a86fe1735'&&user.aal!=='aal2')return reply({error:'Authenticator verification required.'},403);
   if(!user.email||user.is_anonymous)return reply({error:'A verified host account is required.'},403);
   if(Number(req.headers.get('content-length'))>2048)return reply({error:'Request too large.'},413);
   const raw=await req.text();if(raw.length>2048)return reply({error:'Request too large.'},413);
   let body;try{body=JSON.parse(raw);}catch{return reply({error:'Invalid request.'},400);}
   if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>!['action','interval'].includes(k)))return reply({error:'Invalid request.'},400);
   if(body.action==='status')return reply(await service.status(user.id));
   if(body.action==='onboarding')return reply(await service.onboarding(user.id,user.email));
   if(body.action==='account_session')return reply(await service.accountSession(user.id,user.email));
   if(body.action==='checkout')return reply(await service.checkout(user.id,user.email,body.interval));
   if(body.action==='portal')return reply(await service.portal(user.id));
   return reply({error:'Unknown payment action.'},400);
  }catch(e){
   if(!(e instanceof PaymentsError))console.error('treestand_payment_failure',JSON.stringify({type:e?.type||e?.name,code:e?.code,status:e?.statusCode,requestId:e?.requestId}));
   return reply({error:e instanceof PaymentsError?e.message:'Payments are unavailable. Recheck the connection and try again.',code:e instanceof PaymentsError?e.code:'unavailable'},e instanceof PaymentsError?e.status:502);
  }
 };
}
export function stripeWebhookHandler({constructEvent,service,livemode}){
 return async req=>{
  const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  if(req.method!=='POST')return reply({error:'Use POST.'},405);
  if(Number(req.headers.get('content-length'))>262144)return reply({error:'Request too large.'},413);
  const raw=await req.text();if(raw.length>262144)return reply({error:'Request too large.'},413);
  let event;
  try{event=await constructEvent(raw,req.headers.get('stripe-signature'));}catch{return reply({error:'Webhook verification failed.'},400);}
  if(event.livemode!==livemode)return reply({error:'Wrong payment environment.'},400);
  try{return reply(await service.webhook(event));}catch{return reply({error:'Payment reconciliation failed. Retry delivery.'},500);}
 };
}
