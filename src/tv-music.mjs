export const musicChoices=[{id:'woodland',name:'Woodland Calm'},{id:'evening',name:'Evening Drift'},{id:'shores',name:'Quiet Shores'}];
const scores={woodland:{tempo:10,chords:[[48,55,59,62],[45,52,55,59],[41,48,52,55],[43,50,55,57]]},evening:{tempo:13,chords:[[50,57,60,64],[46,53,57,60],[48,55,58,62],[45,52,57,60]]},shores:{tempo:12,chords:[[41,48,52,55],[43,50,53,57],[45,52,55,60],[48,55,59,62]]}};
export function musicScore(id){if(!Object.prototype.hasOwnProperty.call(scores,id))throw Error('Choose one of the available music options.');return scores[id];}
export function musicVolume(value){return Math.max(0,Math.min(40,Number(value)||0));}
export function createMusicPlayer(Context=globalThis.AudioContext||globalThis.webkitAudioContext){
 let context=null,master=null,timer=null,next=0,bar=0,score=null,generation=0;
 function stop(){generation++;if(timer!==null){clearInterval(timer);timer=null;}const old=context;context=null;master=null;old?.close().catch(()=>{});}
 function volume(value){if(master&&context)master.gain.setTargetAtTime(musicVolume(value)/100,context.currentTime,.15);}
 async function play(id,value){const selected=musicScore(id);stop();if(!Context)throw Error('Music is unavailable in this TV browser.');const attempt=generation;const ctx=new Context();context=ctx;master=ctx.createGain();master.gain.value=musicVolume(value)/100;master.connect(ctx.destination);score=selected;
 let resumeTimeout;try{await Promise.race([ctx.resume(),new Promise((_,reject)=>{resumeTimeout=setTimeout(()=>reject(Error('The TV browser needs a remote input to enable sound.')),2000);})]);clearTimeout(resumeTimeout);if(attempt!==generation||context!==ctx)return false;if(ctx.state!=='running')throw Error('Press Play again to allow music on this TV.');next=ctx.currentTime+.15;bar=0;
 function note(midi,start,length,level){const frequency=440*Math.pow(2,(midi-69)/12);for(const [harmonic,weight] of [[1,1],[2,.14]]){const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.value=frequency*harmonic;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(level*weight,start+Math.min(2,length/4));gain.gain.linearRampToValueAtTime(level*weight*.65,start+length*.65);gain.gain.linearRampToValueAtTime(0,start+length);osc.connect(gain);gain.connect(master);osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start(start);osc.stop(start+length+.05);}}
 function schedule(){if(context!==ctx)return;while(next<ctx.currentTime+2){const chord=score.chords[bar%score.chords.length];chord.forEach((midi,i)=>note(midi,next+i*.22,score.tempo+1,.07));note(chord[(bar+1)%chord.length]+12,next+score.tempo*.45,score.tempo*.5,.035);next+=score.tempo;bar++;}}
 schedule();timer=setInterval(schedule,500);return true;
 }catch(error){clearTimeout(resumeTimeout);if(context===ctx)stop();throw error;}}
 return {play,stop,volume};
}
