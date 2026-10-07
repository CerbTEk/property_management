import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {createVideoLoop} from './tv-video.mjs';
export function TvVideo({video,onActive}){
 const element=useRef(null),loop=useRef(null),[notice,setNotice]=useState('');
 const source=video?.url?{...video,remote:true}:{id:'woodland-loop-v1',url:`${import.meta.env.BASE_URL}tv-scenes/woodland-loop.mp4`,remote:false};
 useEffect(()=>{
  loop.current=createVideoLoop(element.current,{onError:setNotice,onActive,fallbackUrl:`${import.meta.env.BASE_URL}tv-scenes/woodland-loop.mp4`});
  function visible(){loop.current?.visibility(!document.hidden);}
  function retry(e){if(e.isTrusted&&!document.hidden)loop.current?.play();}
  document.addEventListener('visibilitychange',visible);window.addEventListener('keydown',retry);window.addEventListener('pointerdown',retry);
  return()=>{loop.current?.dispose();loop.current=null;document.removeEventListener('visibilitychange',visible);window.removeEventListener('keydown',retry);window.removeEventListener('pointerdown',retry);};
 },[]);
 useEffect(()=>{loop.current?.update(source);},[source.id,source.url]);
 return <>{createPortal(<video ref={element} className="tv-background-video" muted autoPlay loop playsInline preload="auto" aria-hidden="true" onPlaying={()=>onActive(true)} onError={()=>loop.current?.failed()}/>,document.body)}{notice&&<p className="tv-video-notice" role="status">{notice}</p>}</>;
}

