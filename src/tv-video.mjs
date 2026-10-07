// Fetch signed video once per version: URL refreshes must not restart the loop.
export function createVideoLoop(element,{fetcher=fetch,urls=URL,onError=()=>{},onActive=()=>{}}={}){
 let version='',generation=0,objectUrl='',disposed=false,visible=true;
 async function play(){
  if(disposed||!visible)return;
  try{await element.play();if(!disposed)onActive(true);}catch{if(!disposed){onActive(false);onError('Press OK to start the photo video.');}}
 }
 async function update(source){
  if(disposed||source.id===version)return;
  const attempt=++generation;
  try{
   let url=source.url;
   if(source.remote){
    const response=await fetcher(url,{cache:'no-store'});
    if(!response.ok)throw Error('Download failed');
    const blob=await response.blob();
    if(!blob.size||blob.size>64*1024*1024)throw Error('Invalid video');
    if(disposed||attempt!==generation)return;
    url=urls.createObjectURL(blob);
   }
   if(disposed||attempt!==generation)return;
   element.pause();element.src=url;element.load();
   if(objectUrl)urls.revokeObjectURL(objectUrl);
   objectUrl=source.remote?url:'';version=source.id;onError('');
   await play();
  }catch{if(!disposed&&attempt===generation)onError('Photo video could not update. The TV screensaver may appear.');}
 }
 return {update,play,visibility(show){visible=show;if(show)return play();element.pause();},
  failed(){version='';onActive(false);onError('Photo video is unavailable. The TV screensaver may appear.');},
  dispose(){disposed=true;generation++;element.pause();element.removeAttribute('src');element.load();if(objectUrl)urls.revokeObjectURL(objectUrl);}
 };
}

