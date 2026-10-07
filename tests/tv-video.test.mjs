import test from 'node:test';import assert from 'node:assert/strict';
import {createVideoLoop} from '../src/tv-video.mjs';
function video(){const listeners={};return {currentTime:0,plays:0,loads:0,play:async function(){this.plays++;},pause(){},load(){this.loads++;},removeAttribute(){},addEventListener(event,fn){listeners[event]=fn;},removeEventListener(event){delete listeners[event];},time(value){this.currentTime=value;listeners.timeupdate?.();}};}
test('native video URL refreshes wait for a loop boundary and avoid minute restarts',async()=>{
 let now=0;const element=video(),player=createVideoLoop(element,{clock:()=>now,renewAfter:300000});
 await player.update({id:'v1',url:'https://signed/a'});await player.update({id:'v1',url:'https://signed/b'});
 assert.equal(element.src,'https://signed/a');assert.equal(element.loads,1);
 element.time(19);element.time(0);assert.equal(element.src,'https://signed/a');
 now=300001;element.time(19);element.time(0);assert.equal(element.src,'https://signed/b');
 await player.update({id:'v2',url:'https://signed/new'});assert.equal(element.src,'https://signed/new');player.dispose();
});
test('playback errors automatically restore the bundled woodland video',async()=>{
 const element=video(),player=createVideoLoop(element,{fallbackUrl:'woodland.mp4'});
 await player.update({id:'v1',url:'https://signed/bad'});await player.failed();
 assert.equal(element.src,'woodland.mp4');
 await player.update({id:'v1',url:'https://signed/fresh'});assert.equal(element.src,'https://signed/fresh');player.dispose();
});
test('hidden screens pause and expired native URLs renew before foreground playback',async()=>{
 let now=0;const element=video(),player=createVideoLoop(element,{clock:()=>now});
 await player.update({id:'v1',url:'https://signed/a'});player.visibility(false);
 const previous=element.plays;await player.play();assert.equal(element.plays,previous);
 await player.update({id:'v1',url:'https://signed/b'});now=600000;
 await player.visibility(true);assert.equal(element.src,'https://signed/b');player.dispose();
});
test('disconnect ignores pending playback completion and removes renewal listeners',async()=>{
 let finish,active=false;const element=video();element.play=()=>new Promise(resolve=>finish=resolve);
 const player=createVideoLoop(element,{onActive:()=>active=true});
 const pending=player.update({id:'v1',url:'https://signed/a'});player.dispose();finish();await pending;
 assert.equal(active,false);const old=element.src;element.time(100);element.time(0);assert.equal(element.src,old);
});

