type Sample={key:string;wanted:boolean;loading:boolean;online:boolean;playing:boolean;buffering:boolean;loaded?:boolean;time:number;duration:number};
/** Decisions use elapsed time, not render ticks. Pauses, offline playback and
 * real track endings never spend the bounded transport retry budget. */
export function createStreamHealth(){
 let key='',position=0,progressAt=0,attempts=0;
 return {sample(s:Sample,now:number):{action:'wait'|'retry'|'failed';position:number;attempts:number}{
  if(key!==s.key){key=s.key;position=s.time;progressAt=now;attempts=0;}
  const time=Math.max(0,s.time||0),moved=time>position+.05,seeked=s.loaded!==false&&time<position-1;
  if(moved||seeked){position=time;progressAt=now;}
  if(!s.wanted||s.loading||!s.online){progressAt=now;return {action:'wait',position,attempts};}
  const ended=s.duration>0&&position>=s.duration-.5;
  const blocked=s.buffering||s.loaded===false;
  const deadline=s.loaded===false&&!s.playing&&position>0?3000:12000;
  if(ended||!blocked||now-progressAt<deadline)return {action:'wait',position,attempts};
  progressAt=now;
  if(attempts>=3)return {action:'failed',position,attempts};
  return {action:'retry',position,attempts:++attempts};
 }};
}
