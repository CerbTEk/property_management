import React,{useEffect,useState} from 'react';
import {db} from './backend';
import {mfaState,verifyMfa} from './mfa.mjs';
export function MfaGate({children,session,staff=false}){
 const [state,setState]=useState(null),[enrollment,setEnrollment]=useState(null),[factor,setFactor]=useState(''),[code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;setState(null);mfaState(db.auth).then(s=>{if(active){setState(s);setFactor(s.factors?.[0]?.id||'');}}).catch(()=>{if(active)setError('Could not check account security. Retry before opening your workspace.');});return()=>{active=false;};},[session.access_token]);
 async function start(){setBusy(true);setError('');try{
  // Clear abandoned, unverified TOTP enrollments only. Never remove an active factor.
  const {data,error}=await db.auth.mfa.listFactors();if(error)throw error;
  for(const f of data.all||[])if(f.factor_type==='totp'&&f.status==='unverified'){const result=await db.auth.mfa.unenroll({factorId:f.id});if(result.error)throw result.error;}
  const result=await db.auth.mfa.enroll({factorType:'totp',issuer:'Treestand Manager'});if(result.error)throw result.error;
  setEnrollment(result.data);setFactor(result.data.id);
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 async function submit(e){e.preventDefault();setBusy(true);setError('');try{await verifyMfa(db.auth,factor,code);setCode('');setEnrollment(null);setState(await mfaState(db.auth));}catch(e){setCode('');setError(e.message);}finally{setBusy(false);}}
 async function retry(){setError('');try{const s=await mfaState(db.auth);setState(s);setFactor(s.factors?.[0]?.id||enrollment?.id||'');}catch{setError('Account security is temporarily unavailable. Try again.');}}
 if(state?.mode==='ready')return children;
 const qr=enrollment?.totp.qr_code;
 return <main className="auth"><h1>{state?.mode==='challenge'?'Verify your sign-in':'Secure your account'}</h1><p>{staff?'An authenticator code is required to access your assigned property work.':'An authenticator code is required to access listings, bookings and guest information.'}</p>{!state&&!error&&<p role="status">Checking account security…</p>}{state?.mode==='enroll'&&!enrollment&&<><p>Add Treestand to your authenticator app, then verify its six-digit code.</p><button disabled={busy} onClick={start}>{busy?'Preparing…':'Set up authenticator'}</button></>}{enrollment&&<><img className="mfa-qr" alt="Scan with your authenticator app" src={qr?.startsWith('data:')?qr:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(qr||'')}/><details><summary>Enter a setup key instead</summary><code className="mfa-secret">{enrollment.totp.secret}</code></details><p>Keep access to your authenticator and its recovery backup. Treestand does not issue recovery codes.</p></>}{(enrollment||state?.mode==='challenge')&&<form onSubmit={submit}>{state?.factors?.length>1&&<label>Authenticator<select value={factor} onChange={e=>setFactor(e.target.value)}>{state.factors.map(f=><option key={f.id} value={f.id}>{f.friendly_name||f.id}</option>)}</select></label>}<label>Authenticator code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label><button disabled={busy}>{busy?'Verifying…':'Verify and continue'}</button></form>}{error&&<p role="alert">{error}</p>}{!state&&error&&<button onClick={retry}>Retry security check</button>}<p>If you lose your authenticator, account recovery requires verified support assistance.</p><button className="link" onClick={()=>db.auth.signOut()}>Sign out</button></main>;
}
