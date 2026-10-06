import {test} from 'node:test';
import assert from 'node:assert/strict';
import {musicChoices,musicScore,musicVolume,createMusicPlayer} from '../src/tv-music.mjs';
function fakeContext(){return class Context{static instances=[];constructor(){this.currentTime=0;this.state='suspended';this.destination={};this.nodes=[];this.gains=[];this.closed=false;this.constructor.instances.push(this);}createGain(){const calls=[],node={gain:{value:0,setValueAtTime(...args){calls.push(args);},linearRampToValueAtTime(...args){calls.push(args);},setTargetAtTime(...args){calls.push(args);}},connect(){},disconnect(){},calls};this.gains.push(node);return node;}createOscillator(){const node={frequency:{value:0},connect(){},disconnect(){},start(time){this.started=time;},stop(time){this.stopped=time;}};this.nodes.push(node);return node;}async resume(){this.state='running';}async close(){this.closed=true;this.state='closed';}};}
test('built-in moods are bounded and reject unsupported music selections',()=>{
 assert.equal(musicChoices.length,3);for(const choice of musicChoices){const score=musicScore(choice.id);assert.ok(score.tempo>=10);assert.equal(score.chords.length,4);}
 for(const choice of ['unknown','constructor','toString'])assert.throws(()=>musicScore(choice));
 assert.equal(musicVolume(100),40);assert.equal(musicVolume(-10),0);assert.equal(musicVolume('bad'),0);assert.equal(musicVolume(15),15);
});
test('music starts only on play, schedules gentle envelopes, updates volume and closes on stop',async()=>{
 const Context=fakeContext(),player=createMusicPlayer(Context);assert.equal(Context.instances.length,0);
 assert.equal(await player.play('woodland',15),true);const context=Context.instances[0];assert.equal(context.gains[0].gain.value,.15);assert.equal(context.nodes.length,10);assert.ok(context.nodes.every(node=>node.started>=.15&&node.stopped>node.started));
 player.volume(80);assert.equal(context.gains[0].calls.at(-1)[0],.4);player.stop();assert.equal(context.closed,true);
});
test('disconnect during pending audio permission never starts a scheduler',async()=>{
 const Base=fakeContext();let release;class Pending extends Base{resume(){return new Promise(resolve=>{release=()=>{this.state='running';resolve();};});}}
 const player=createMusicPlayer(Pending),promise=player.play('shores',10);const context=Pending.instances.at(-1);player.stop();release();assert.equal(await promise,false);assert.equal(context.nodes.length,0);assert.equal(context.closed,true);
});
test('unsupported browsers and denied playback return an actionable error and release audio',async()=>{
 await assert.rejects(()=>createMusicPlayer(null).play('woodland',15),/unavailable/);
 const Base=fakeContext();class Denied extends Base{async resume(){throw Error('Playback denied');}}
 await assert.rejects(()=>createMusicPlayer(Denied).play('evening',15),/denied/);assert.equal(Denied.instances.at(-1).closed,true);
});
test('a browser that waits indefinitely for an audio gesture times out and closes its context',async()=>{
 const Base=fakeContext();class Waiting extends Base{resume(){return new Promise(()=>{});}}
 await assert.rejects(()=>createMusicPlayer(Waiting).play('woodland',15),/remote input/);assert.equal(Waiting.instances.at(-1).closed,true);assert.equal(Waiting.instances.at(-1).nodes.length,0);
});
