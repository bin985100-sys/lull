export function wrapIndex(value:number,count:number){'worklet';return count>0?((Math.round(value)%count)+count)%count:0;}
export function nearestSlot(index:number,position:number,count:number){'worklet';return count>0?index+Math.round((position-index)/count)*count:0;}
export function visibleSlots(center:number,count:number,expanded:boolean){const n=Math.min(count,expanded?11:7),first=Math.round(center)-Math.floor(n/2);return Array.from({length:n},(_,i)=>first+i);}
export function deckPose(d:number,mode:number,count:number,width:number,size:number){
 'worklet';const a=Math.abs(d),theta=d*2*Math.PI/Math.max(1,Math.min(count,11)),depth=(Math.cos(theta)+1)/2;
 const mix=(x:number,y:number)=>x+(y-x)*mode;
 return {x:mix(d*size*.69,Math.sin(theta)*Math.min(width*.43,250)),y:mix(a*7,(1-Math.cos(theta))*size*.22-size*.08),scale:mix(Math.max(.5,1-a*.16),.43+depth*.35),angleY:mix(Math.max(-58,Math.min(58,-d*35)),-Math.sin(theta)*52),angleZ:mix(d*-1.4,Math.sin(theta)*-7),opacity:mix(Math.max(0,1-a*.24),.34+depth*.66),z:Math.round(mix(100-a*14,20+depth*100))};
}
