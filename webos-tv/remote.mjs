// Choose the closest control in the requested direction, favoring aligned rows/columns.
export function nextFocus(rects,current,key){
 if(!rects.length)return -1;if(current<0)return 0;
 const vectors={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},vector=vectors[key];if(!vector)return -1;
 const origin=rects[current];if(!origin)return -1;const x=origin.left+origin.width/2,y=origin.top+origin.height/2;
 let best=-1,score=Infinity;
 rects.forEach((r,i)=>{if(i===current)return;const dx=r.left+r.width/2-x,dy=r.top+r.height/2-y;const forward=dx*vector[0]+dy*vector[1],side=Math.abs(dx*vector[1]-dy*vector[0]);if(forward<=1)return;const rank=forward+side*3;if(rank<score){score=rank;best=i;}});return best;
}
