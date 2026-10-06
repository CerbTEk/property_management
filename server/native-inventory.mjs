import {NativeOAuthError} from './native-oauth.mjs';
export function nativeInventory({provider,accessToken,fetcher=fetch,now=Date.now}){
 if(!['tedee','igloohome'].includes(provider))throw new NativeOAuthError('Manufacturer inventory is unavailable.','unsupported');
 const endpoint=provider==='tedee'?'https://api.tedee.com/api/v37/my/lock':'https://api.igloohome.co/home/devices';
 const fail=()=>new NativeOAuthError('Manufacturer returned an incomplete or invalid inventory. Retry sync.','invalid_response');
 return {async list(){
  if(typeof accessToken!=='string'||!accessToken||accessToken.length>16384)throw new NativeOAuthError('Connect your manufacturer account first.','not_connected');
  const locks=[],seen=new Set(),cursors=new Set();let cursor,ignored=0;
  for(let page=1;page<=20;page++){
   const url=new URL(endpoint);
   if(provider==='tedee'){url.searchParams.set('ItemsPerPage','100');url.searchParams.set('Page',String(page));}
   else{url.searchParams.set('limit','100');if(cursor)url.searchParams.set('cursor',cursor);}
   let response;try{response=await fetcher(url.href,{method:'GET',headers:{Authorization:'Bearer '+accessToken,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new NativeOAuthError('Manufacturer inventory is temporarily unavailable.','unavailable');}
   if(response.status===401||response.status===403)throw new NativeOAuthError('Reconnect your manufacturer account or check its granted permissions.','authorization_failed');
   if(response.status===402)throw new NativeOAuthError('The manufacturer requires an active API subscription. Review its commercial terms.','subscription_required');
   if(response.status===429)throw new NativeOAuthError('Manufacturer rate limit reached. Try again later.','rate_limit');
   if(!response.ok)throw new NativeOAuthError('Manufacturer inventory is temporarily unavailable.','unavailable');
   let value;try{const text=await response.text();if(text.length>1048576)throw Error();value=JSON.parse(text);}catch{throw fail();}
   const items=provider==='tedee'?value?.result:value?.payload;
   if(!Array.isArray(items)||items.length>100||provider==='tedee'&&value.success!==true)throw fail();
   for(const item of items){
    if(!item||typeof item!=='object')throw fail();
    const raw=provider==='tedee'?item.id:item.deviceId;
    if(provider==='tedee'&&(!Number.isSafeInteger(raw)||raw<=0))throw fail();
    if(typeof raw!=='string'&&typeof raw!=='number')throw fail();
    const id=String(raw);if(!/^[A-Za-z0-9_-]{1,128}$/.test(id)||seen.has(id))throw fail();seen.add(id);
    // Keypads, bridges and other accessories are not assignable room locks.
    if(provider==='igloohome'&&item.type!=='Lock'){ignored++;continue;}
    const name=String((provider==='tedee'?item.name:item.deviceName)||provider+' lock '+id).replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,120);
    if(!name)throw fail();
    locks.push({provider,brand:provider,provider_device_id:id,name,online:provider==='tedee'&&typeof item.isConnected==='boolean'?item.isConnected:null,capabilities:{},synced_at:new Date(now()).toISOString()});
   }
   if(provider==='tedee'){if(items.length<100)return {locks,ignored};}
   else{
    if(typeof value.nextCursor!=='string'||value.nextCursor.length>512||/[\x00-\x1f\x7f]/.test(value.nextCursor))throw fail();
    if(!value.nextCursor)return {locks,ignored};
    if(!items.length||cursors.has(value.nextCursor))throw fail();cursors.add(value.nextCursor);cursor=value.nextCursor;
   }
  }
  throw new NativeOAuthError('Inventory exceeded the supported page limit. No devices were imported.','pagination_limit');
 }};
}
