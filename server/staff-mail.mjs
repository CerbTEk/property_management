export const staffOrigin='https://treestand-manager.webflow.io';
export function staffMailConfig(env){const enabled=env('TREESTAND_EMAIL_ENABLED')==='true',key=env('RESEND_API_KEY')||'',from=env('TREESTAND_EMAIL_FROM')||'',webhook=env('TREESTAND_EMAIL_WEBHOOK_SECRET')||'';return {enabled,key,from,webhook,configured:enabled&&Boolean(key)&&/^[^\r\n]+@[^\r\n]+$/.test(from)&&Boolean(webhook)};}
export async function sendStaffMail({fetcher=fetch,config,job,id}){
 if(!config.configured)throw Error('Email setup required');
 let response;try{response=await fetcher('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json','Idempotency-Key':'treestand-staff-'+id},body:JSON.stringify({from:config.from,to:[job.to],subject:job.subject,text:job.text})});}catch{return {state:'unknown',provider:null};}
 if(!response.ok)return {state:response.status>=500||response.status===429?'unknown':'failed',provider:null};
 try{const data=await response.json();if(typeof data.id!=='string'||!data.id||data.id.length>200)return {state:'unknown',provider:null};return {state:'accepted',provider:data.id};}catch{return {state:'unknown',provider:null};}
}
export async function verifyStaffWebhook(raw,headers,secret,now=Date.now()){
 const id=headers.get('svix-id'),timestamp=headers.get('svix-timestamp'),signature=headers.get('svix-signature');
 if(!id||id.length>200||!/^\d+$/.test(timestamp||'')||Math.abs(now/1000-Number(timestamp))>300||!signature||signature.length>2000||!secret)return false;
 try{const keyBytes=Uint8Array.from(atob(secret.startsWith('whsec_')?secret.slice(6):secret),c=>c.charCodeAt(0));const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['verify']);const bytes=new TextEncoder().encode(id+'.'+timestamp+'.'+raw);for(const part of signature.split(' ')){if(!part.startsWith('v1,'))continue;const sig=Uint8Array.from(atob(part.slice(3)),c=>c.charCodeAt(0));if(await crypto.subtle.verify('HMAC',key,sig,bytes))return true;}return false;}catch{return false;}
}
export function staffMailHandler({authenticate,prepare,claim,finish,config,fetcher}){return async req=>{
 const origin=req.headers.get('Origin'),headers={'Content-Type':'application/json','Cache-Control':'no-store',...(origin===staffOrigin?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'}:{})};
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&origin!==staffOrigin)return reply({error:'Origin unavailable'},403);if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(req.method!=='POST')return reply({error:'POST required'},405);
 const token=req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];const user=token?await authenticate(token):null;if(!user?.email_confirmed_at)return reply({error:'Sign in required'},401);if(user.aal!=='aal2'&&user.id!=='3f03551d-89de-4214-aa7a-db7a86fe1735')return reply({error:'Authenticator verification required'},403);
 let body;try{const raw=await req.text();if(raw.length>4096)throw Error();body=JSON.parse(raw);}catch{return reply({error:'Invalid request'},400);}
 if(body.action==='status')return reply({configured:config.configured,state:config.configured?'ready':'setup_required'});
 if(!config.configured)return reply({state:'setup_required',configured:false});
 if(!['invite','task'].includes(body.kind)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.reference||''))return reply({error:'Choose an invitation or task'},400);
 try{const id=await prepare(token,body.kind,body.reference),job=await claim(id,user.id);if(job.state!=='sending'||!job.lease)return reply({state:job.state});const outcome=await sendStaffMail({fetcher,config,job,id});await finish(id,job.lease,outcome.state,outcome.provider);return reply({state:outcome.state});}catch{return reply({error:'Email request unavailable. Refresh before retrying.'},409);}
};}
