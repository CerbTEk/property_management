import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const endpoint='https://pjeejfntvtbqbsuxcwds.supabase.co/functions/v1/display-video-worker';
const origin='https://pjeejfntvtbqbsuxcwds.supabase.co';
const execute=promisify(execFile);
async function identity(){
 if(!process.env.ACTIONS_ID_TOKEN_REQUEST_URL||!process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)throw Error('GitHub workload identity unavailable');
 const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);url.searchParams.set('audience','treestand-display-video');
 const response=await fetch(url,{headers:{Authorization:`Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Workload identity unavailable');return (await response.json()).value;
}
async function call(body){
 const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${await identity()}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 if(response.status===409)return {superseded:true};
 if(!response.ok)throw Error(`Conversion service status ${response.status}`);return response.json();
}
function privateUrl(raw){const url=new URL(raw);if(url.origin!==origin||!url.pathname.startsWith('/storage/v1/'))throw Error('Unexpected storage destination');return url;}
async function boundedFile(url,limit){
 const response=await fetch(privateUrl(url),{redirect:'error',signal:AbortSignal.timeout(90000)});
 if(!response.ok)throw Error('Photo download failed');
 const chunks=[];let size=0;
 for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('Photo size exceeded');chunks.push(chunk);}
 return Buffer.concat(chunks);
}
if(process.env.GITHUB_REF==='refs/heads/codex/photo-video')await call({action:'validate-stock-photos'});
const started=Date.now();
for(let jobIndex=0;jobIndex<3&&(jobIndex===0||Date.now()-started<5*60000);jobIndex++){
 const {job}=await call({action:'claim'});if(!job){console.log('Photo video queue checked.');break;}
 const directory=await mkdtemp(join(tmpdir(),'treestand-video-'));
 const context={property_id:job.property_id,lease_id:job.lease_id,version:job.version};
 try{
  const paths=[];
  for(const [i,url] of job.photos.entries()){
   const path=join(directory,`photo-${i}`);await writeFile(path,await boundedFile(url,8*1024*1024));paths.push(path);
  }
  const manifest=join(directory,'manifest.json'),output=join(directory,'slideshow.mp4');
  await writeFile(manifest,JSON.stringify({paths,seconds:job.seconds}));
  await execute('python3',[resolve('scripts/render-display-video.py'),'--manifest',manifest,'--output',output],{timeout:960000,maxBuffer:4096});
  const video=await readFile(output);if(video.length>64*1024*1024)throw Error('Video size exceeded');
  const uploaded=await fetch(privateUrl(job.upload_url),{method:'PUT',headers:{'Content-Type':'video/mp4','x-upsert':'false'},body:video,redirect:'error',signal:AbortSignal.timeout(120000)});
  if(!uploaded.ok)throw Error('Video upload failed');
  const result=await call({action:'complete',...context});
  console.log(result.superseded?'A newer photo edit replaced this conversion.':'Photo video generated and published.');
 }catch{
  await call({action:'fail',...context}).catch(()=>{});
  console.error('Photo conversion failed; the service will retry.');process.exitCode=1;
 }finally{await rm(directory,{recursive:true,force:true});}
}

