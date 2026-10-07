import {verifyIdentity} from './identity.mjs';
const bucket='treestand-display-videos',uuid=/^[0-9a-f-]{36}$/;
export function createVideoWorker(admin,{authenticate=verifyIdentity,clock=()=>new Date()}={}){
 return async req=>{
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  if(!await authenticate((req.headers.get('authorization')||'').replace(/^Bearer /,'')))return reply({error:'Worker identity required'},401);
  let input;try{const raw=await req.text();if(raw.length>1024)throw Error();input=JSON.parse(raw);}catch{return reply({error:'Invalid request'},400);}
  const now=clock(),iso=now.toISOString();let activeJob=null;
  try{
   if(input.action==='claim'){
    // Retire only completed/replaced private videos, after existing signed URLs expire.
    const cleanup=await admin.from('ts_display_video_cleanup').select('object_path').lte('delete_after',iso).limit(30);
    if(cleanup.error)throw Error();
    if(cleanup.data.length){
     const paths=cleanup.data.map(x=>x.object_path);const removed=await admin.storage.from(bucket).remove(paths);
     if(!removed.error)await admin.from('ts_display_video_cleanup').delete().in('object_path',paths);
    }
    const candidates=await admin.from('ts_display_videos').select('*')
     .or(`state.eq.pending,and(state.eq.failed,attempts.lt.3,retry_after.lte.${iso}),and(state.eq.running,lease_until.lt.${iso})`)
     .order('updated_at').limit(1);
    if(candidates.error)throw Error();const candidate=candidates.data[0];if(!candidate)return reply({job:null});
    const lease=crypto.randomUUID();
    const claim=await admin.from('ts_display_videos').update({state:'running',lease_id:lease,lease_until:new Date(now.getTime()+20*60000).toISOString(),attempts:candidate.attempts+1,updated_at:iso})
     .eq('property_id',candidate.property_id).eq('owner_id',candidate.owner_id).eq('requested_version',candidate.requested_version).eq('updated_at',candidate.updated_at).select('*').maybeSingle();
    if(claim.error)throw Error();if(!claim.data)return reply({job:null});const job=claim.data;activeJob=job;
    const [photos,settings]=await Promise.all([
     admin.from('ts_display_images').select('object_path,position').eq('property_id',job.property_id).eq('owner_id',job.owner_id).order('position').limit(12),
     admin.from('ts_guest_displays').select('slideshow_seconds').eq('property_id',job.property_id).eq('owner_id',job.owner_id).maybeSingle()
    ]);
    if(photos.error||settings.error)throw Error();
    if(!photos.data.length){
     await admin.from('ts_display_videos').update({state:'ready',object_path:null,photo_count:0,ready_version:job.requested_version,lease_id:null,lease_until:null,updated_at:iso})
      .eq('property_id',job.property_id).eq('lease_id',lease).eq('requested_version',job.requested_version);
     return reply({job:null});
    }
    const paths=photos.data.map(p=>p.object_path);
    if(paths.some(p=>!p.startsWith(job.property_id+'/')||!/^[-0-9a-f]{36}\/[-0-9a-f]{36}\.(jpg|png|webp)$/.test(p)))throw Error();
    const downloads=await admin.storage.from('treestand-display-images').createSignedUrls(paths,300);
    const outputPath=`${job.property_id}/${lease}.mp4`;
    // Even abandoned uploads are retired; completion removes this staging entry.
    const staging=await admin.from('ts_display_video_cleanup').upsert({object_path:outputPath,delete_after:new Date(now.getTime()+2*3600000).toISOString()});
    if(staging.error)throw Error();
    const output=await admin.storage.from(bucket).createSignedUploadUrl(outputPath);
    if(downloads.error||output.error||downloads.data.some(p=>!p.signedUrl?.startsWith('https://')))throw Error();
    const seconds=[10,20,30,60].includes(settings.data?.slideshow_seconds)?settings.data.slideshow_seconds:20;
    return reply({job:{property_id:job.property_id,version:job.requested_version,lease_id:lease,seconds,
     photos:downloads.data.map(x=>x.signedUrl),upload_url:output.data.signedUrl}});
   }
   if(!['complete','fail'].includes(input.action)||!uuid.test(input.property_id)||!uuid.test(input.lease_id)||!Number.isSafeInteger(input.version))return reply({error:'Invalid completion'},400);
   const result=await admin.from('ts_display_videos').select('*').eq('property_id',input.property_id).eq('lease_id',input.lease_id)
    .eq('requested_version',input.version).eq('state','running').gt('lease_until',iso).maybeSingle();
   if(result.error)throw Error();const job=result.data;
   if(!job)return reply({error:'Job superseded'},409);
   if(input.action==='fail'){
    await admin.from('ts_display_videos').update({state:'failed',last_error:job.attempts>=3?'Photo video could not be generated. Update the photos to try again.':'Photo video could not be generated. It will retry automatically.',retry_after:new Date(now.getTime()+5*60000).toISOString(),lease_id:null,lease_until:null,updated_at:iso})
     .eq('property_id',job.property_id).eq('lease_id',input.lease_id).eq('requested_version',input.version);
    return reply({ok:true});
   }
   const filename=`${input.lease_id}.mp4`,path=`${job.property_id}/${filename}`;
   const objects=await admin.storage.from(bucket).list(job.property_id,{search:filename,limit:10});
   const object=objects.data?.find(x=>x.name===filename);
   if(objects.error||!object||object.metadata?.mimetype!=='video/mp4'||!object.metadata.size||object.metadata.size>67108864)return reply({error:'Completed video unavailable'},400);
   const photos=await admin.from('ts_display_images').select('id').eq('property_id',job.property_id).eq('owner_id',job.owner_id).limit(12);
   if(photos.error)throw Error();
   const completed=await admin.from('ts_display_videos').update({state:'ready',ready_version:input.version,object_path:path,photo_count:photos.data.length,lease_id:null,lease_until:null,last_error:'',updated_at:iso})
    .eq('property_id',job.property_id).eq('lease_id',input.lease_id).eq('requested_version',input.version).select('property_id');
   if(completed.error)throw Error();
   if(!completed.data.length){await admin.storage.from(bucket).remove([path]);return reply({error:'Job superseded'},409);}
   await admin.from('ts_display_video_cleanup').delete().eq('object_path',path);
   if(job.object_path&&job.object_path!==path)await admin.from('ts_display_video_cleanup').upsert({object_path:job.object_path,delete_after:new Date(now.getTime()+5*60000).toISOString()});
   return reply({ok:true});
  }catch{
   if(activeJob)await admin.from('ts_display_videos').update({state:'failed',last_error:'Photo video could not be prepared. Update the photos if retries fail.',retry_after:new Date(now.getTime()+5*60000).toISOString(),lease_id:null,lease_until:null,updated_at:iso})
    .eq('property_id',activeJob.property_id).eq('lease_id',activeJob.lease_id).eq('requested_version',activeJob.requested_version);
   return reply({error:'Video conversion temporarily unavailable'},503);
  }
 };
}

