import {createHash} from 'node:crypto';
import {TTLockError} from './ttlock.mjs';
export function ttlockAuth({clientId,clientSecret,fetcher=fetch,now=Date.now}){
 async function request(values,existingUid){
  if(!clientId||!clientSecret)throw new TTLockError('Treestand TTLock application setup is incomplete.','not_configured');
  let response;try{response=await fetcher('https://api.sciener.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,...values}),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new TTLockError('TTLock sign-in is temporarily unavailable.','unavailable');}
  if(!response.ok)throw new TTLockError('TTLock could not authorize this account.','authorization_failed');
  let value;try{value=await response.json();}catch{throw new TTLockError('Invalid TTLock authorization response.','invalid_response');}
  if(value.errcode||value.error)throw new TTLockError('TTLock rejected the sign-in. Check your TTLock app credentials or reconnect.','authorization_failed');
  const uid=value.uid===undefined?existingUid:String(value.uid);
  if(typeof value.access_token!=='string'||!value.access_token||value.access_token.length>4096||typeof value.refresh_token!=='string'||!value.refresh_token||value.refresh_token.length>4096||!Number.isInteger(value.expires_in)||value.expires_in<=0||value.expires_in>31536000||!/^[1-9][0-9]{0,19}$/.test(uid||''))throw new TTLockError('Invalid TTLock authorization response.','invalid_response');
  return {accessToken:value.access_token,refreshToken:value.refresh_token,uid,expiresAt:new Date(now()+value.expires_in*1000).toISOString()};
 }
 return {
  async login(username,password){
   if(typeof username!=='string'||!username.trim()||username.length>256||typeof password!=='string'||!password||password.length>1024)throw new TTLockError('Enter your TTLock app username and password.','invalid');
   // MD5 is mandated by TTLock's token API. It is not used for local password storage.
   return request({username:username.trim(),password:createHash('md5').update(password,'utf8').digest('hex')});
  },
  async refresh(refreshToken,uid){if(typeof refreshToken!=='string'||!refreshToken||refreshToken.length>4096)throw new TTLockError('Reconnect your TTLock account.','authorization_failed');return request({grant_type:'refresh_token',refresh_token:refreshToken},uid);}
 };
}
export function tokenVault(secret,clientId){
 const encoder=new TextEncoder();
 async function key(){if(!/^[a-f0-9]{64}$/i.test(secret||'')||!clientId)throw new TTLockError('Treestand secure token storage is not configured.','not_configured');return crypto.subtle.importKey('raw',Uint8Array.from(secret.match(/../g),h=>parseInt(h,16)),'AES-GCM',false,['encrypt','decrypt']);}
 const aad=owner=>encoder.encode('treestand:ttlock:v1:'+clientId+':'+owner);
 return {
  async seal(owner,tokens){const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(owner)},await key(),encoder.encode(JSON.stringify(tokens)));return 'v1.'+btoa(String.fromCharCode(...iv,...new Uint8Array(ciphertext)));},
  async open(owner,sealed){try{if(!sealed?.startsWith('v1.'))throw Error();const bytes=Uint8Array.from(atob(sealed.slice(3)),c=>c.charCodeAt(0));const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:aad(owner)},await key(),bytes.slice(12));return JSON.parse(new TextDecoder().decode(clear));}catch{throw new TTLockError('Reconnect your TTLock account.','connection_invalid');}}
 };
}
export function ttlockAccounts({clientId,clientSecret,encryptionKey,store,fetcher=fetch,now=Date.now}){
 const auth=ttlockAuth({clientId,clientSecret,fetcher,now}),vault=tokenVault(encryptionKey,clientId);
 const configured=Boolean(clientId&&clientSecret&&/^[a-f0-9]{64}$/i.test(encryptionKey||''));
 async function owned(owner){const row=await store.read(owner);if(row&&row.owner_id!==owner)throw new TTLockError('Connection ownership mismatch.','ownership');return row;}
 async function save(owner,revision,tokens){if(!await store.save(owner,revision,{provider_uid:tokens.uid,sealed_tokens:await vault.seal(owner,tokens),expires_at:tokens.expiresAt,status:'connected'}))throw new TTLockError('The connection changed. Refresh and retry.','connection_changed');}
 return {
  async status(owner){const row=await owned(owner);return {provider:'ttlock',mode:'direct',configured,connected:row?.status==='connected',ready:configured&&row?.status==='connected',expires_at:row?.status==='connected'?row.expires_at:null};},
  async connect(owner,username,password){
   if(!configured)throw new TTLockError('Treestand TTLock application setup is incomplete.','not_configured');
   const claim=await store.claim(owner);if(!claim)throw new TTLockError('Wait a few seconds before trying TTLock sign-in again.','rate_limit');
   if(claim.owner_id!==owner)throw new TTLockError('Connection ownership mismatch.','ownership');
   await save(owner,claim.revision,await auth.login(username,password));return {connected:true};
  },
  async accessToken(owner){
   if(!configured)throw new TTLockError('Treestand TTLock application setup is incomplete.','not_configured');
   const row=await owned(owner);if(!row||row.status!=='connected')throw new TTLockError('Connect your TTLock account first.','not_connected');
   let tokens=await vault.open(owner,row.sealed_tokens);
   if(tokens.uid!==row.provider_uid||!tokens.accessToken||!tokens.refreshToken||!Number.isFinite(Date.parse(tokens.expiresAt)))throw new TTLockError('Reconnect your TTLock account.','connection_invalid');
   if(Date.parse(tokens.expiresAt)<=now()+300000){
    const refreshed=await auth.refresh(tokens.refreshToken,tokens.uid);
    if(refreshed.uid!==row.provider_uid)throw new TTLockError('TTLock account identity changed. Reconnect.','ownership');
    await save(owner,row.revision,refreshed);tokens=refreshed;
   }
   return tokens.accessToken;
  },
  async disconnect(owner){const row=await owned(owner);if(row&&!await store.save(owner,row.revision,{status:'disconnected',sealed_tokens:null,expires_at:null}))throw new TTLockError('Connection changed. Refresh and retry.','connection_changed');return {connected:false};}
 };
}
