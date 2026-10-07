import test from 'node:test';
import assert from 'node:assert/strict';
import {createVideoLoop} from '../src/tv-video.mjs';
test('signed URL refreshes do not download again or restart the playing video',async()=>{
 let downloads=0,plays=0,removed=[];
 const element={play:async()=>{plays++;},pause(){},load(){},removeAttribute(){}};
 const player=createVideoLoop(element,{fetcher:async()=>{downloads++;return {ok:true,blob:async()=>({size:100})};},urls:{createObjectURL:()=>`blob:${downloads}`,revokeObjectURL:url=>removed.push(url)}});
 await player.update({id:'v1',url:'https://signed/a',remote:true});
 await player.update({id:'v1',url:'https://signed/b',remote:true});
 assert.equal(downloads,1);assert.equal(plays,1);
 await player.update({id:'v2',url:'https://signed/c',remote:true});
 assert.equal(element.src,'blob:2');assert.deepEqual(removed,['blob:1']);
 player.dispose();assert.deepEqual(removed,['blob:1','blob:2']);
});
test('failed updates preserve the previous video and hidden screens pause playback',async()=>{
 let plays=0,pauses=0,notice='';const element={play:async()=>{plays++;},pause(){pauses++;},load(){},removeAttribute(){}};
 const player=createVideoLoop(element,{fetcher:async()=>({ok:false}),onError:value=>notice=value});
 await player.update({id:'starter',url:'local.mp4',remote:false});
 await player.update({id:'new',url:'https://signed/new',remote:true});
 assert.equal(element.src,'local.mp4');assert.ok(notice);
 player.visibility(false);const previous=plays;await player.play();assert.equal(plays,previous);
 await player.visibility(true);assert.equal(plays,previous+1);assert.ok(pauses);player.dispose();
});
test('disconnect while downloading never attaches or plays a late video',async()=>{
 let finish,played=false;const element={play:async()=>{played=true;},pause(){},load(){},removeAttribute(){}};
 const player=createVideoLoop(element,{fetcher:()=>new Promise(resolve=>finish=resolve)});
 const download=player.update({id:'new',url:'https://signed/new',remote:true});player.dispose();
 finish({ok:true,blob:async()=>({size:100})});await download;assert.equal(played,false);assert.equal(element.src,undefined);
});

