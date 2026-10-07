export async function screenVideo(admin,device){
 const {data,error}=await admin.from('ts_display_videos').select('object_path,ready_version,photo_count')
  .eq('property_id',device.property_id).eq('owner_id',device.owner_id).maybeSingle();
 if(error||!data?.object_path)return null;
 const path=data.object_path;
 if(!path.startsWith(device.property_id+'/')||!/^[-0-9a-f]{36}\/[-0-9a-f]{36}\.mp4$/.test(path))return null;
 const signed=await admin.storage.from('treestand-display-videos').createSignedUrl(path,1200);
 if(signed.error||!signed.data?.signedUrl?.startsWith('https://'))return null;
 return {id:path.split('/')[1],url:signed.data.signedUrl,photo_count:data.photo_count};
}

