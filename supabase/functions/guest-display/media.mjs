export async function screenImages(admin,device){
 const {data,error}=await admin.from('ts_display_images').select('object_path,caption,position').eq('property_id',device.property_id).eq('owner_id',device.owner_id).order('position').limit(12);
 if(error)throw Error('Photo read failed');
 const images=(data||[]).filter(image=>image.object_path?.startsWith(device.property_id+'/')&&/\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(image.object_path));
 if(!images.length)return [];
 const signed=await admin.storage.from('treestand-display-images').createSignedUrls(images.map(image=>image.object_path),120);
 if(signed.error)return [];
 return images.flatMap((image,index)=>{const url=signed.data?.[index]?.signedUrl;return url&&url.startsWith('https://')?[{id:image.object_path.split('/')[1],url,caption:image.caption||''}]:[];});
}
