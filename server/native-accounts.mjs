import {nativeOAuth,nativeCallback,NativeOAuthError} from './native-oauth.mjs';
const encode=new TextEncoder();
export async function nativeHash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function nativeVault(secret,provider,clientId){
 async function key(){if(!/^[a-f0-9]{64}$/i.test(secret||'')||!clientId)throw new NativeOAuthError('Secure manufacturer connections are being configured.','not_configured');return crypto.subtle.importKey('raw',Uint8Array.from(secret.match(/../g),h=>parseInt(h,16)),'AES-GCM',false,['encrypt','decrypt']);}
 const aad=(owner,purpose)=>encode.encode(JSON.stringify(['treestand-native-v1',provider,clientId,owner,purpose]));
 return {
  async seal(owner,purpose,value){const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(owner,purpose)},await key(),encode.encode(JSON.stringify(value)));const bytes=new Uint8Array(12+encrypted.byteLength);bytes.set(iv);bytes.set(new Uint8Array(encrypted),12);return 'v1.'+btoa(Array.from(bytes,n=>String.fromCharCode(n)).join(''));},
  async open(owner,purpose,value){try{if(typeof value!=='string'||!value.startsWith('v1.')||value.length>65536)throw Error();const bytes=Uint8Array.from(atob(value.slice(3)),c=>c.charCodeAt(0));const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:aad(owner,purpose)},await key(),bytes.slice(12));return JSON.parse(new TextDecoder().decode(clear));}catch{throw new NativeOAuthError('Connection could not be verified. Start a new sign-in.','connection_invalid');}}
 };
}
export function nativeAccounts({provider,clientId,clientSecret,encryptionKey,store,fetcher=fetch,now=Date.now}){
 const oauth=nativeOAuth({provider,clientId,clientSecret,fetcher,now}),vault=nativeVault(encryptionKey,provider,clientId);
 const configured=oauth.status().configured&&/^[a-f0-9]{64}$/i.test(encryptionKey||'');
 function setup(){if(!configured)throw new NativeOAuthError('Manufacturer approval and Treestand connection setup are pending.','not_configured');}
 function binding(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw new NativeOAuthError('Start sign-in from this browser.','invalid');return nativeHash(value);}
 async function owned(owner){const row=await store.read(owner,provider);if(row&&(row.owner_id!==owner||row.provider!==provider))throw new NativeOAuthError('Connection ownership mismatch.','ownership');return row;}
 return {
  async status(owner){const row=await owned(owner),connected=row?.status==='connected';return {provider,mode:'native',configured,connected,expires_at:connected?row.expires_at:null,reauthorize:connected&&row.refresh_failed===true,inventoryReady:configured&&connected&&row.refresh_failed!==true,liveValidated:false,last_synced_at:row?.last_synced_at||null,imported_count:row?.imported_count||0};},
  async begin(owner,browserBinding){
   setup();const bindingHash=await binding(browserBinding),result=await oauth.begin(owner);
   const revision=await store.begin(owner,provider,{state_hash:await nativeHash(result.transaction.state),binding_hash:bindingHash,sealed_transaction:await vault.seal(owner,'authorization',result.transaction),expires_at:new Date(now()+600000).toISOString()});
   if(!revision)throw new NativeOAuthError('Wait a few seconds before starting another sign-in.','rate_limit');
   return {provider,url:result.url,state:result.transaction.state};
  },
  async complete(owner,browserBinding,callbackUrl){
   setup();const bindingHash=await binding(browserBinding);let url;
   try{url=new URL(callbackUrl);}catch{throw new NativeOAuthError('Invalid manufacturer callback.','invalid');}
   const expected=new URL(nativeCallback),state=url.searchParams.get('state');
   if(url.origin!==expected.origin||url.pathname!==expected.pathname||url.hash||url.username||url.password||url.searchParams.getAll('state').length!==1||!state?.startsWith('tslock.'+provider+'.')||state.length>256)throw new NativeOAuthError('Invalid manufacturer callback.','invalid');
   // Atomic server-side DELETE RETURNING: a replay, wrong browser or wrong host
   // cannot reach the token endpoint. Disconnect/reconnect rotates the revision.
   const row=await store.consume(owner,provider,await nativeHash(state),bindingHash);
   if(!row)throw new NativeOAuthError('Sign-in expired, was already used, or belongs to another browser. Start again.','invalid');
   if(row.owner_id!==owner||row.provider!==provider)throw new NativeOAuthError('Connection ownership mismatch.','ownership');
   const transaction=await vault.open(owner,'authorization',row.sealed_transaction);
   const tokens=await oauth.complete(owner,transaction,callbackUrl);
   if(!await store.save(owner,provider,row.account_revision,{sealed_tokens:await vault.seal(owner,'tokens',tokens),expires_at:tokens.expiresAt,status:'connected'}))throw new NativeOAuthError('Connection changed during sign-in. Start again.','connection_changed');
   return {provider,connected:true,inventoryReady:true,liveValidated:false};
  },
  async access(owner){
   setup();let row=await owned(owner);
   if(!row||row.status!=='connected'||row.refresh_failed)throw new NativeOAuthError('Reconnect your manufacturer account.','not_connected');
   if(row.refresh_until&&Date.parse(row.refresh_until)>now())throw new NativeOAuthError('Account authorization is renewing. Try sync again shortly.','refresh_pending');
   let tokens=await vault.open(owner,'tokens',row.sealed_tokens);
   if(typeof tokens.accessToken!=='string'||!tokens.accessToken||typeof tokens.refreshToken!=='string'||!tokens.refreshToken||!Number.isFinite(Date.parse(tokens.expiresAt)))throw new NativeOAuthError('Reconnect your manufacturer account.','connection_invalid');
   if(Date.parse(tokens.expiresAt)<=now()+300000){
    const claim=await store.claimRefresh(owner,provider,row.revision);
    if(!claim)throw new NativeOAuthError('Account authorization changed or is renewing. Try again shortly.','refresh_pending');
    if(claim.owner_id!==owner||claim.provider!==provider)throw new NativeOAuthError('Connection ownership mismatch.','ownership');
    row=claim;tokens=await vault.open(owner,'tokens',row.sealed_tokens);
    try{
     tokens=await oauth.refresh(tokens.refreshToken);
     if(!await store.finishRefresh(owner,provider,row.revision,{sealed_tokens:await vault.seal(owner,'tokens',tokens),expires_at:tokens.expiresAt,refresh_until:null,refresh_failed:false}))throw new NativeOAuthError('Connection changed during renewal. Recheck your account.','connection_changed');
    }catch(e){await store.finishRefresh(owner,provider,row.revision,{refresh_until:null,refresh_failed:true});throw e;}
   }
   return {accessToken:tokens.accessToken,revision:row.revision};
  },
  async disconnect(owner){await owned(owner);await store.disconnect(owner,provider);return {provider,connected:false};}
 };
}
