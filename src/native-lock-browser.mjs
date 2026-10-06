const storageKey='treestand-native-lock-signin';
export function captureNativeCallback(location,history){
 const url=new URL(location.href),state=url.searchParams.get('state');
 if(!/^tslock\.(tedee|igloohome)\./.test(state||''))return null;
 const result={url:url.href,state,provider:state.split('.')[1]};
 // Remove code/error values before Supabase initializes or the page renders.
 for(const key of ['code','state','error','error_description','session_state'])url.searchParams.delete(key);
 history.replaceState(null,'',url.pathname+url.search+url.hash);
 return result;
}
export const nativeLockCallback=typeof window==='undefined'?null:captureNativeCallback(window.location,window.history);
export function saveNativeSignIn(storage,owner,result,binding,now=Date.now()){
 if(!['tedee','igloohome'].includes(result.provider)||!result.state?.startsWith('tslock.'+result.provider+'.'))throw Error('Invalid manufacturer sign-in.');
 storage.setItem(storageKey,JSON.stringify({owner,provider:result.provider,state:result.state,binding,issuedAt:now}));
}
export function pendingNativeSignIn(storage,owner,callback,now=Date.now()){
 let record;try{record=JSON.parse(storage.getItem(storageKey));}catch{}
 if(!record||record.owner!==owner||record.provider!==callback?.provider||record.state!==callback?.state||!Number.isFinite(record.issuedAt)||record.issuedAt>now||record.issuedAt+600000<=now||!/^[a-f0-9]{64}$/.test(record.binding||''))throw Error('This sign-in expired or was started in another browser or account. Start again.');
 return record;
}
export function clearNativeSignIn(storage){storage.removeItem(storageKey);}
export function manufacturerUrl(provider,value){
 const url=new URL(value),expected=provider==='tedee'?'https://tedee.b2clogin.com':'https://auth.igloohome.co';
 if(!['tedee','igloohome'].includes(provider)||url.origin!==expected||url.username||url.password||url.hash)throw Error('Invalid manufacturer sign-in destination.');
 return url.href;
}
