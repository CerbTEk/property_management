import React,{useEffect,useRef,useState} from 'react';
import {loadConnectAndInitialize} from '@stripe/connect-js/pure';
import {db} from './backend';
import {invokePayments,paymentRedirect,onboardingRedirect} from './payments-client.mjs';
export function Payments({user}){
 const [status,setStatus]=useState(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[connect,setConnect]=useState(null),[component,setComponent]=useState('account-onboarding');
 const alive=useRef(true),connectRef=useRef(null),refreshStarted=useRef(false);
 async function refresh(){const next=await invokePayments(db,'status');if(alive.current)setStatus(next);}
 useEffect(()=>{alive.current=true;const check=()=>refresh().catch(e=>{if(alive.current)setNotice(e.message);});check();window.addEventListener('focus',check);return()=>{alive.current=false;window.removeEventListener('focus',check);connectRef.current?.logout().catch(()=>{});};},[user.id]);
 async function act(job){setBusy(true);setNotice('');try{await job();await refresh();}catch(e){if(alive.current)setNotice(e.message);}finally{if(alive.current)setBusy(false);}}
 async function openOnboarding(){const result=await invokePayments(db,'onboarding');window.location.assign(onboardingRedirect(result.url));}
 useEffect(()=>{if(new URLSearchParams(window.location.search).get('payments')==='onboarding_refresh'&&!refreshStarted.current){refreshStarted.current=true;act(openOnboarding);}},[user.id]);
 async function openConnect(){
  if(connectRef.current){await connectRef.current.logout();connectRef.current=null;setConnect(null);}
  const session=await invokePayments(db,'account_session');
  if(!alive.current)return;
  let initialSecret=session.clientSecret;
  const instance=loadConnectAndInitialize({publishableKey:session.publishableKey,fetchClientSecret:async()=>{if(initialSecret){const value=initialSecret;initialSecret=null;return value;}const next=await invokePayments(db,'account_session');return next.clientSecret;},appearance:{variables:{colorPrimary:'#123C35',colorBackground:'#ffffff',colorText:'#20342d',borderRadius:'10px'}}});
  connectRef.current=instance;setConnect(instance);
 }
 const plans=status?.plans||[];
 return <>
  <div className="payments-intro"><span className="eyebrow">YOUR BUSINESS, YOUR PAYMENTS</span><span className="badge">No CerbTek booking commission</span></div>
  {new URLSearchParams(window.location.search).get('payments')==='onboarding_return'&&<p className="notice">You returned from Stripe setup. Recheck status to see whether any information is still required.</p>}
  {notice&&<p className="feedback" role="alert">{notice}</p>}
  {!status&&!notice&&<p role="status">Checking payment setup…</p>}
  {status?.mode==='sandbox'&&<div className="notice">Test environment · Stripe test payments do not move real money.</div>}
  <div className="payment-cards"><section className="panel"><h2>Guest payments</h2><p role="status">{!status?'Checking connection…':!status.configured?'Host payment connections are being configured.':!status.connected?'Connect Stripe to prepare your host payment account.':status.ready?'Your Stripe card-payment capability is active.':'Stripe account connected. Complete the required information to enable card payments.'}</p><p>You pay Stripe’s processing fees directly. Manage your account details, refunds, disputes and payouts with Stripe.</p>{!status?.ready&&<button disabled={busy||!status?.configured} onClick={()=>act(openOnboarding)}>{busy?'Working…':status?.connected?'Continue setup on Stripe':'Set up host payments'}</button>} {status?.connected&&<button className="link" disabled={busy||!status?.configured} onClick={()=>act(openConnect)}>{connect?'Reload payment settings':'Open payment settings'}</button>} <button className="link" disabled={busy} onClick={()=>act(refresh)}>Recheck status</button>{status?.dashboardUrl&&<p><a href={status.dashboardUrl} target="_blank" rel="noopener noreferrer">Open your Stripe Dashboard</a></p>}<p className="payment-note">Direct booking checkout is still being developed. Connecting Stripe does not enable guest charges yet. Airbnb continues to handle its own booking payments.</p></section>
  <section className="panel"><h2>Treestand subscription</h2><p>Manage your monthly or annual software subscription to CerbTek LLC.</p>{status?.subscription?<><p><strong>{status.subscription.status.replace(/_/g,' ')}</strong>{status.subscription.cancelAtPeriodEnd?' · cancellation scheduled':''}</p>{status.subscription.currentPeriodEnd&&<p>Current period ends {new Date(status.subscription.currentPeriodEnd).toLocaleDateString()}.</p>}<button disabled={busy||!status.configured} onClick={()=>act(async()=>{const r=await invokePayments(db,'portal');window.location.assign(paymentRedirect(r.url));})}>Manage subscription</button></>:<><p>{plans.length?'Choose a billing interval. Review the total in Stripe before subscribing.':'Subscription pricing will be announced before paid checkout opens. Your pilot workspace remains available.'}</p>{plans.map(p=><button key={p.interval} disabled={busy} onClick={()=>act(async()=>{const r=await invokePayments(db,'checkout',p.interval);window.location.assign(paymentRedirect(r.url));})}>{new Intl.NumberFormat('en-US',{style:'currency',currency:p.currency}).format(p.amount/100)} / {p.interval==='monthly'?'month':'year'}</button>)}</>}<>{status?.connected&&!status?.subscription&&<button className="link" disabled={busy} onClick={()=>act(async()=>{const r=await invokePayments(db,'portal');window.location.assign(paymentRedirect(r.url));})}>Manage billing or pending payment</button>}</><p className="payment-note">Returning from checkout does not confirm payment. Subscription status updates after Stripe’s verified payment events arrive.</p></section></div>
  {connect&&<section className="panel payment-settings"><h2>Your Stripe account</h2><StripeComponent connect={connect} name="notification-banner" onError={setNotice}/><div className="actions" aria-label="Stripe account views">{[['account-onboarding','Complete setup'],['account-management','Account details'],['payments','Payments & refunds'],['payouts','Payouts']].map(([name,label])=><button key={name} className={component===name?'':'link'} disabled={busy} onClick={()=>name==='account-onboarding'?act(openOnboarding):setComponent(name)}>{label}</button>)}</div><StripeComponent key={component} connect={connect} name={component} onError={setNotice} onExit={()=>act(refresh)}/></section>}
 </>;
}
function StripeComponent({connect,name,onError,onExit}){
 const ref=useRef();
 useEffect(()=>{const element=connect.create(name);element.setOnLoadError?.(()=>onError('Stripe could not load this embedded view. Continue setup on Stripe, or reload payment settings to try again.'));if(name==='account-onboarding')element.setOnExit?.(onExit);ref.current.replaceChildren(element);return()=>element.remove();},[connect,name]);
 return <div ref={ref} className="stripe-component"/>;
}
