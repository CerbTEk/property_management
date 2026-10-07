import {seamProviders,codeCompatibility} from '../src/lock-providers.mjs';
import {guestAccessPlan} from '../src/lock-model.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class SeamError extends Error{constructor(message,code='provider_error'){super(message);this.code=code;}}
export function seamClient({apiKey,fetcher=fetch}){
 async function request(path,params={},method='GET'){
  if(!apiKey)throw new SeamError('Seam is not configured.','not_configured');
  const url=new URL('https://connect.getseam.com/'+path);
  if(method==='GET'||method==='DELETE')for(const [k,v]of Object.entries(params))url.searchParams.set(k,String(v));
  let response;try{response=await fetcher(url.toString(),{method,headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},...(['GET','DELETE'].includes(method)?{}:{body:JSON.stringify(params)}),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new SeamError('Lock provider is unavailable.','unavailable');}
  if(!response.ok)throw new SeamError('Lock provider rejected the request.');
  try{return await response.json();}catch{throw new SeamError('Invalid provider response.','invalid_response');}
 }
 function checkView(view,ownerId){
  if(!view||!uuid.test(view.connect_webview_id)||view.customer_key!==ownerId)throw new SeamError('Connection ownership could not be verified.','ownership');
  if(view.selected_provider==='ttlock')throw new SeamError('TTLock uses the direct connection in Treestand.','direct_required');
  return view;
 }
 function connectionUrl(view){
  let url;try{url=new URL(view.url);}catch{throw new SeamError('Invalid connection URL.','invalid_response');}
  if(url.protocol!=='https:'||url.hostname!=='connect.getseam.com')throw new SeamError('Invalid connection URL.','invalid_response');
  return url.toString();
 }
 return {
  request,
  async ownedDevice(ownerId,viewIds,deviceId){
   if(!uuid.test(deviceId)||!Array.isArray(viewIds))throw new SeamError('Invalid device.','ownership');
   let found;
   for(const viewId of viewIds){
    let locks;try{locks=await this.inventory(ownerId,viewId,true);}catch(e){if(['pending','direct_required'].includes(e.code))continue;throw e;}
    found=locks.find(l=>l.provider_device_id===deviceId);if(found)break;
   }
   if(!found)throw new SeamError('The connected account does not own this device.','ownership');
   const {device}=await request('devices/get',{device_id:deviceId});
   if(!device||device.device_id!==deviceId||device.connected_account_id!==found.connected_account_id)throw new SeamError('Device ownership changed.','ownership');
   return device;
  },
  async status(){
   const {workspace}=await request('workspaces/get');
   if(!workspace||!uuid.test(workspace.workspace_id)||typeof workspace.is_sandbox!=='boolean'||typeof workspace.is_suspended!=='boolean')throw new SeamError('Workspace could not be verified.','invalid_response');
   return {configured:true,ready:!workspace.is_suspended,mode:workspace.is_sandbox?'sandbox':'live'};
  },
  async resume(ownerId,viewId){
   if(!uuid.test(ownerId)||!uuid.test(viewId))throw new SeamError('Invalid connection.','ownership');
   const {connect_webview}=await request('connect_webviews/get',{connect_webview_id:viewId});
   const view=checkView(connect_webview,ownerId);
   if(view.connect_webview_id!==viewId)throw new SeamError('Connection mismatch.','ownership');
   if(view.accepted_providers?.includes('ttlock'))throw new SeamError('Start a new connection for other brands. TTLock uses direct access.','direct_required');
   return {id:viewId,url:connectionUrl(view),login_successful:view.login_successful===true};
  },
  async connect(ownerId){
   if(!uuid.test(ownerId))throw new SeamError('Invalid owner.','ownership');
   const {connect_webview}=await request('connect_webviews/create',{customer_key:ownerId,accepted_capabilities:['lock'],accepted_providers:seamProviders,any_provider_allowed:false,automatically_manage_new_devices:true,wait_for_device_creation:true,custom_redirect_url:'https://treestand-manager.webflow.io/app/'},'POST');
   const view=checkView(connect_webview,ownerId);
   return {id:view.connect_webview_id,url:connectionUrl(view)};
  },
  async inventory(ownerId,viewId,verification=false){
   if(!uuid.test(ownerId)||!uuid.test(viewId))throw new SeamError('Invalid connection.','ownership');
   const {connect_webview}=await request('connect_webviews/get',{connect_webview_id:viewId});
   const view=checkView(connect_webview,ownerId);
   if(view.connect_webview_id!==viewId)throw new SeamError('Connection mismatch.','ownership');
   if(!view.login_successful||!uuid.test(view.connected_account_id))throw new SeamError('Finish signing into the lock provider first.','pending');
   const locks=[],seen=new Set();let cursor;
   for(let page=0;page<100;page++){
    const payload=await request('devices/list',{customer_key:ownerId,connected_account_id:view.connected_account_id,limit:100,...(cursor?{page_cursor:cursor}:{})});
    if(!Array.isArray(payload.devices))throw new SeamError('Invalid inventory.','invalid_response');
    for(const device of payload.devices){
     if(!uuid.test(device.device_id)||device.connected_account_id!==view.connected_account_id)throw new SeamError('Device ownership mismatch.','ownership');
     if(seen.has(device.device_id))throw new SeamError('Duplicate inventory device.','invalid_response');seen.add(device.device_id);
     const p=device.properties||{};
     locks.push({...verification?{connected_account_id:device.connected_account_id}:{},provider:'seam',provider_device_id:device.device_id,name:String(device.display_name||device.nickname||'Smart lock').slice(0,120),brand:seamProviders.includes(view.selected_provider)?view.selected_provider:'other',online:typeof p.online==='boolean'?p.online:null,capabilities:{online_codes:device.can_program_online_access_codes===true,code_lengths:Array.isArray(p.supported_code_lengths)?p.supported_code_lengths.filter(n=>Number.isInteger(n)&&n>=4&&n<=12):[]},synced_at:new Date().toISOString()});
    }
    if(!payload.pagination?.has_next_page)return locks;
    const next=payload.pagination.next_page_cursor;
    if(typeof next!=='string'||!next||next===cursor)throw new SeamError('Invalid inventory pagination.','invalid_response');cursor=next;
   }
   throw new SeamError('Inventory exceeds supported import limit.','limit');
  }
 };
}
// Request builder only: no device writes. Always recompute from server-loaded records.
export function seamBookingCodeBody({property,booking,locks,assignments,properties,reservations,lockRecordId,now=Date.now()}){
 const plan=guestAccessPlan(property,booking,locks,assignments,{properties,reservations});
 if(plan.issues.length||plan.end<=now)throw new SeamError('Guest access needs review.','needs_review');
 const lock=plan.locks.find(l=>l.id===lockRecordId);
 if(!lock||lock.provider!=='seam'||!uuid.test(lock.provider_device_id))throw new SeamError('Invalid assigned provider device.','not_assigned');
 if(lock.brand==='ttlock')throw new SeamError('TTLock uses the direct connection in Treestand.','direct_required');
 if(codeCompatibility(lock,lock.code))throw new SeamError('Device cannot use the guest phone last four.','incompatible');
 return {device_id:lock.provider_device_id,code:lock.code,name:'Treestand guest access',starts_at:new Date(plan.start).toISOString(),ends_at:new Date(plan.end).toISOString(),prefer_native_scheduling:true,attempt_for_offline_device:false,use_backup_access_code_pool:false};
}
