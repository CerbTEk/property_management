import React,{useEffect,useState} from 'react';
import {db} from './backend';
import {invokeLockConnector} from './lock-connector.mjs';
import {nativeLockCallback,saveNativeSignIn,pendingNativeSignIn,clearNativeSignIn,manufacturerUrl} from './native-lock-browser.mjs';
const brands=[['tedee','Tedee'],['igloohome','igloohome']];
let completion;
export function NativeLocks({user,busy,onAction}){
 const [statuses,setStatuses]=useState({}),[notice,setNotice]=useState('');
 async function status(provider){const result=await invokeLockConnector(db,'native_status',undefined,{provider});setStatuses(previous=>({...previous,[provider]:result}));}
 useEffect(()=>{
  let active=true;
  const check=()=>Promise.all(brands.map(async([provider])=>{try{const result=await invokeLockConnector(db,'native_status',undefined,{provider});if(active)setStatuses(previous=>({...previous,[provider]:result}));}catch(e){if(active)setStatuses(previous=>({...previous,[provider]:{error:e.message}}));}}));
  check();window.addEventListener('focus',check);
  if(nativeLockCallback){
   // Share completion across workspace remounts so a single-use grant is never
   // exchanged twice. The server independently enforces one-time consumption.
   if(!completion||completion.owner!==user.id){
    const promise=(async()=>{try{const pending=pendingNativeSignIn(sessionStorage,user.id,nativeLockCallback);return await invokeLockConnector(db,'native_complete',undefined,{provider:pending.provider,browser_binding:pending.binding,callback_url:nativeLockCallback.url});}finally{clearNativeSignIn(sessionStorage);}})();
    completion={owner:user.id,promise};
   }
   completion.promise.then(()=>{if(active){setNotice('Manufacturer account linked. Device import and guest-code automation are still being developed.');check();}}).catch(e=>{if(active)setNotice(e.message);});
  }
  return ()=>{active=false;window.removeEventListener('focus',check);};
 },[user.id]);
 async function connect(provider){
  const binding=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
  const result=await invokeLockConnector(db,'native_begin',undefined,{provider,browser_binding:binding});
  const url=manufacturerUrl(provider,result.url);saveNativeSignIn(sessionStorage,user.id,result,binding);
  window.location.assign(url);
 }
 async function disconnect(provider){await invokeLockConnector(db,'native_disconnect',undefined,{provider});clearNativeSignIn(sessionStorage);await status(provider);}
 return <section className="panel"><h2>Direct manufacturer connections</h2><p>Connect your account with the manufacturer. Treestand keeps your connection tokens encrypted. Device import and live guest-code installation are still being developed.</p>{notice&&<p role="status">{notice}</p>}{brands.map(([provider,name])=>{const s=statuses[provider];return <article className="listing" key={provider}><div><h3>{name}</h3><p role="status">{s?.error||(!s?'Checking connection…':!s.configured?'Manufacturer approval and connection setup are pending.':s.connected?(s.reauthorize?'Account authorization expired. Reconnect to continue.':'Your manufacturer account is linked.'):'Ready to connect your manufacturer account.')}</p><button disabled={busy||!s?.configured||Boolean(s?.error)} onClick={()=>onAction(()=>connect(provider))}>{s?.connected?'Reconnect':'Connect'} {name}</button> <button disabled={busy} onClick={()=>onAction(()=>status(provider))}>Recheck connection</button>{s?.connected&&<> <button disabled={busy} onClick={()=>onAction(()=>disconnect(provider))}>Disconnect {name}</button></>}</div></article>;})}</section>;
}
