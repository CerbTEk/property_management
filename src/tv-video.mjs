// webOS uses its native decoder: Blob URLs are unsupported on some LG models.
export function createVideoLoop(element,{clock=()=>performance.now(),renewAfter=300000,fallbackUrl='',onError=()=>{},onActive=()=>{}}={}){
 let version='',loadedUrl='',loadedAt=0,latest=null,generation=0,lastTime=0,disposed=false,visible=true;
 async function activate(source,notice=''){
  if(disposed)return;
  generation++;version=source.id;loadedUrl=source.url;loadedAt=clock();lastTime=0;
  element.pause();element.src=source.url;element.load();onError(notice);
  await play();
 }
 async function recover(){
  if(disposed)return;
  if(latest?.id===version&&latest.url!==loadedUrl)return activate(latest);
  if(fallbackUrl&&loadedUrl!==fallbackUrl)return activate({id:'woodland-loop-v1',url:fallbackUrl},'Your photo video is reconnecting. The woodland video is playing.');
  onActive(false);onError('Press OK to restart the welcome video.');
 }
 async function play(){
  if(disposed||!visible)return;
  const attempt=generation;
  try{await element.play();if(!disposed&&attempt===generation)onActive(true);}
  catch(error){if(!disposed&&attempt===generation){
   if(error?.name==='NotAllowedError'){onActive(false);onError('Press OK to start the photo video.');}
   else await recover();
  }}
 }
 async function update(source){
  if(disposed)return;latest=source;
  // Minute refreshes retain the playing native URL until a safe loop boundary.
  if(source.id===version)return;
  await activate(source);
 }
 function time(){
  const current=element.currentTime,wrapped=lastTime>current+1;lastTime=current;
  if(wrapped&&latest?.id===version&&latest.url!==loadedUrl&&clock()-loadedAt>=renewAfter)activate(latest);
 }
 element.addEventListener('timeupdate',time);
 return {update,play,failed:recover,
  visibility(show){visible=show;if(!show){element.pause();return;}
   if(latest&&latest.url!==loadedUrl&&clock()-loadedAt>=renewAfter)return activate(latest);
   return play();
  },
  dispose(){disposed=true;generation++;element.removeEventListener('timeupdate',time);element.pause();element.removeAttribute('src');element.load();}
 };
}

