import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TvPlayer} from '../src/tv-player.jsx';
import {nextFocus} from './remote.mjs';
import '../src/style.css';
import './tv.css';
function App(){
 const [exit,setExit]=useState(false),stay=useRef(null),previous=useRef(null);
 useEffect(()=>{if(exit)stay.current?.focus();},[exit]);
 useEffect(()=>{
  function keys(e){
   if(e.defaultPrevented)return;
   if(e.keyCode===461||e.key==='BrowserBack'||e.key==='Escape'){
    e.preventDefault();if(exit){setExit(false);previous.current?.focus();}else{previous.current=document.activeElement;setExit(true);}return;
   }
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
   const active=document.activeElement;
   if(active?.matches('input,select,textarea')&&['ArrowLeft','ArrowRight'].includes(e.key))return;
   if(active?.matches('select,input[type=range]'))return;
   const scope=document.querySelector('[role="dialog"]')||document;
   const elements=Array.from(scope.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')).filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
   const rects=elements.map(el=>el.getBoundingClientRect());const current=elements.indexOf(active);const next=nextFocus(rects,current,e.key);
   if(next>=0){e.preventDefault();elements[next].focus();}
  }
  window.addEventListener('keydown',keys);return()=>window.removeEventListener('keydown',keys);
 },[exit]);
 useEffect(()=>{document.querySelector('.pairing-groups input')?.focus();const observer=new MutationObserver(()=>{if(document.activeElement===document.body){(document.querySelector('.tv-guest-nav button')||document.querySelector('.pairing-groups input'))?.focus();}});observer.observe(document.getElementById('root'),{childList:true,subtree:true});return()=>observer.disconnect();},[]);
 function resume(){setExit(false);previous.current?.focus();}
 return <><TvPlayer installed/>{exit&&<div className="tv-exit" role="dialog" aria-modal="true" aria-labelledby="exit-title"><section><h2 id="exit-title">Leave the welcome screen?</h2><p>Your screen stays paired when you return.</p><button ref={stay} onClick={resume}>Stay here</button><button onClick={()=>window.close()}>Exit to TV</button></section></div>}</>;
}
createRoot(document.getElementById('root')).render(<App/>);
