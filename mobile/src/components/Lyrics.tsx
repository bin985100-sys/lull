import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, LinearTransition, interpolateColor, scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import type { Track } from '@/api/audius';
import { activeLine, getLyrics, type LLine, type LWord, type Lyrics } from '@/api/lyrics';
import { player, usePlayer, useProgress } from '@/player/player';
import { useTheme } from '@/theme/state';
import { F } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { haptic, T } from '@/ui/kit';

export const useLyricsUi=create<{open:boolean}>(()=>({open:false}));
export const openLyrics=()=>{haptic();useLyricsUi.setState({open:true});};
export const closeLyrics=()=>useLyricsUi.setState({open:false});
type State={status:'loading'|'ok'|'none'|'error';data?:Lyrics};
export function useLyrics(t:Track|undefined):State{
 const [result,setResult]=useState<{id:string;state:State}|null>(null);
 useEffect(()=>{if(!t)return;let alive=true;void getLyrics(t).then(data=>{if(alive)setResult({id:t.id,state:{status:data.lines||data.plain?'ok':'none',data}});},()=>{if(alive)setResult({id:t.id,state:{status:'error'}});});return()=>{alive=false;};},[t]);
 return result?.id===t?.id?result!.state:{status:'loading'};
}

/** Interpolation runs on the UI thread. React only hears about an actual line change. */
function useTimeline(lines:LLine[],enabled:boolean){
 const clock=useSharedValue(useProgress.getState().time),[cur,setCur]=useState(()=>activeLine(lines,useProgress.getState().time));
 const reduced=useReducedMotion();
 const starts=useMemo(()=>lines.map(l=>l.t),[lines]);
 useEffect(()=>{
  if(!enabled){cancelAnimation(clock);return;}
  const sync=()=>{const time=useProgress.getState().time;if(!reduced&&usePlayer.getState().playing&&AppState.currentState!=='background'&&AppState.currentState!=='inactive'){if(Math.abs(clock.get()-time)>.6)clock.set(time);clock.set(withTiming(time+.28,{duration:280,easing:Easing.linear}));}else{cancelAnimation(clock);clock.set(time);}};
  const progress=useProgress.subscribe(sync),playing=usePlayer.subscribe((s,p)=>{if(s.playing!==p.playing)sync();}),app=AppState.addEventListener('change',sync);sync();
  return()=>{progress();playing();app.remove();cancelAnimation(clock);};
 },[clock,enabled,reduced]);
 useAnimatedReaction(()=>{const time=clock.get()+.15;let lo=0,hi=starts.length-1,answer=-1;while(lo<=hi){const m=(lo+hi)>>1;if(starts[m]<=time){answer=m;lo=m+1;}else hi=m-1;}return answer;},(next,previous)=>{if(next!==previous)scheduleOnRN(setCur,next);},[starts]);
 return {clock,cur};
}
const Word=memo(function Word({word,clock,color}:{word:LWord;clock:SharedValue<number>;color:string}){
 const style=useAnimatedStyle(()=>{const p=Math.max(0,Math.min(1,(clock.get()-word.t)/Math.max(.05,word.e-word.t)));return {color:interpolateColor(p*p*(3-2*p),[0,1],[color+'55',color])};});
 return <Animated.Text style={[{color},style]}>{(word.space?' ':'')+word.text}</Animated.Text>;
});
type LineState='past'|'now'|'next';
const LyricLine=memo(function LyricLine({line,index,state,clock,size,onLayout,onPress}:{line:LLine;index:number;state:LineState;clock:SharedValue<number>;size:number;onLayout?:(index:number,y:number)=>void;onPress?:(line:LLine)=>void}){
 const {dark,colors:C}=useTheme(),reduced=useReducedMotion(),right=line.side==='right';
 const layout=useCallback((e:LayoutChangeEvent)=>onLayout?.(index,e.nativeEvent.layout.y),[index,onLayout]);
 const press=useCallback(()=>onPress?.(line),[line,onPress]);
 const base={fontFamily:F.heavy,fontSize:size,lineHeight:Math.round(size*1.3),letterSpacing:-.6,color:C.tx,textAlign:right?'right':'left'} as const;
 return <Animated.View onLayout={layout} style={{opacity:state==='now'?1:state==='past'?.6:dark?.38:.5,transform:[{scale:state==='now'?1:.98}],transformOrigin:right?'right center':'left center',transitionProperty:['opacity','transform'],transitionDuration:reduced?0:650}}>
  <Pressable onPress={press} accessibilityRole="button" accessibilityLabel={line.text||'Проигрыш'} accessibilityState={{selected:state==='now'}} aria-selected={state==='now'} style={{paddingVertical:size*.36,paddingLeft:right?24:0,paddingRight:right?0:24}}>
   <Text style={base}>{!line.text.trim()?'•••':state==='now'&&line.timedWords?line.words.map((w,i)=><Word key={i} word={w} clock={clock} color={C.tx}/>):line.text}</Text>
   {line.bg?<Text style={[base,{fontSize:size*.63,lineHeight:size*.86,marginTop:5,opacity:.65}]}>{line.bg}</Text>:null}
  </Pressable>
 </Animated.View>;
});
const credit=(s:string|null)=>s==='lrclib'?'LRCLIB':s==='betterlyrics'?'Better Lyrics':s==='youtube'?'YouTube Music':'';
const seekLine=(line:LLine)=>{haptic();player.seek(Math.max(0,line.t-.05));};

export function LyricsCard({track,active=true}:{track:Track;active?:boolean}){
 const {colors:C}=useTheme(),st=useLyrics(track);
 return <View style={{borderRadius:36,backgroundColor:C.tx+'12',padding:24,minHeight:180,overflow:'hidden'}}>
  <Pressable onPress={st.status==='ok'?openLyrics:undefined} accessibilityRole="button" accessibilityLabel="Открыть текст на весь экран" disabled={st.status!=='ok'} style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:14}}><T style={{fontFamily:F.bold,fontSize:18}}>Текст песни</T>{st.status==='ok'?<Icon name="arrowUR" size={24}/>:null}</Pressable>
  {st.status==='loading'?<ActivityIndicator color={C.tx} style={{marginTop:24}}/>:st.status==='none'||st.status==='error'?<T v="sub">{st.status==='none'?'Для этой песни текста пока нет':'Не получилось загрузить текст'}</T>:null}
  {st.status==='ok'&&st.data?.lines?<CardLines lines={st.data.lines} enabled={active}/>:st.data?.plain?<T numberOfLines={5} style={{fontFamily:F.bold,fontSize:22,lineHeight:31}}>{st.data.plain}</T>:null}
 </View>;
}
function CardLines({lines,enabled}:{lines:LLine[];enabled:boolean}){
 const {clock,cur}=useTimeline(lines,enabled),reduced=useReducedMotion(),from=Math.max(0,cur);
 const open=useCallback(()=>openLyrics(),[]);
 return <View style={{height:220,overflow:'hidden'}}>{lines.slice(from,from+4).map((line,k)=><Animated.View key={from+k} layout={reduced?undefined:LinearTransition.duration(650)} entering={reduced?undefined:FadeIn.duration(650)} exiting={reduced?undefined:FadeOut.duration(450)}><LyricLine line={line} index={from+k} state={from+k===cur?'now':'next'} clock={clock} size={23} onPress={open}/></Animated.View>)}</View>;
}

export function LyricsFull({track}:{track:Track}){
 const {colors:C}=useTheme(),st=useLyrics(track),safe=useSafeAreaInsets(),reduced=useReducedMotion();
 return <Animated.View role="dialog" aria-modal accessibilityLabel="Текст песни" accessibilityViewIsModal entering={reduced?undefined:FadeIn.duration(500)} exiting={reduced?undefined:FadeOut.duration(400)} style={[StyleSheet.absoluteFill,{zIndex:20,backgroundColor:C.bg+'77'}]}>
  <View style={{flexDirection:'row',alignItems:'center',gap:13,paddingHorizontal:22+Math.max(safe.left,safe.right),paddingTop:Math.max(18,safe.top+10),paddingBottom:16}}>
   <Image source={{uri:track.artwork}} style={{width:46,height:46,borderRadius:23,backgroundColor:C.s2}}/>
   <View style={{flex:1,minWidth:0}}><T numberOfLines={1} style={{fontFamily:F.bold,fontSize:16}}>{track.title}</T><T numberOfLines={1} style={{fontSize:12,marginTop:4,opacity:.65}}>{track.artist}</T></View>
   <Pressable onPress={closeLyrics} accessibilityRole="button" accessibilityLabel="Закрыть текст" style={{width:48,height:48,borderRadius:24,backgroundColor:C.tx+'17',alignItems:'center',justifyContent:'center'}}><Icon name="down" size={25}/></Pressable>
  </View>
  {st.status==='loading'?<ActivityIndicator color={C.tx} style={{marginTop:80}}/>:null}
  {st.data?.lines?<FullLines lines={st.data.lines} source={st.data.source}/>:st.data?.plain?<ScrollView contentContainerStyle={{padding:26,paddingBottom:safe.bottom+60}}><T style={{fontFamily:F.bold,fontSize:28,lineHeight:40}}>{st.data.plain}</T><T v="small" style={{marginTop:28}}>Без синхронизации · {credit(st.data.source)}</T></ScrollView>:st.status!=='loading'?<T style={{padding:26}}>Текст пока недоступен</T>:null}
 </Animated.View>;
}
function FullLines({lines,source}:{lines:LLine[];source:string|null}){
 const {colors:C}=useTheme(),{width}=useWindowDimensions(),safe=useSafeAreaInsets(),reduced=useReducedMotion(),{clock,cur}=useTimeline(lines,true);
 const sv=useAnimatedRef<ScrollView>(),scroll=useSharedValue(0),positions=useRef<number[]>([]),current=useRef(cur),followingRef=useRef(true);
 const [height,setHeight]=useState(600),[following,setFollowing]=useState(true);
 useDerivedValue(()=>{scrollTo(sv,0,scroll.get(),false);});
 useEffect(()=>{current.current=cur;followingRef.current=following;},[cur,following]);
 const move=useCallback((index:number)=>{const y=positions.current[Math.max(0,index)];if(y!=null)scroll.set(reduced?Math.max(0,y-height*.28):withTiming(Math.max(0,y-height*.28),{duration:780,easing:Easing.bezier(.22,.75,.2,1)}));},[height,reduced,scroll]);
 useEffect(()=>{if(following)move(cur);},[cur,following,move]);
 const layout=useCallback((index:number,y:number)=>{positions.current[index]=y;if(index===Math.max(0,current.current)&&followingRef.current)move(index);},[move]);
 const manual=useCallback(()=>{cancelAnimation(scroll);setFollowing(false);followingRef.current=false;},[scroll]);
 const seek=useCallback((line:LLine)=>{setFollowing(true);followingRef.current=true;seekLine(line);},[]);
 const side=Math.max(24,safe.left+20,safe.right+20,(width-760)/2),size=width<350?27:width>900?42:34;
 return <View style={{flex:1,overflow:'hidden'}}>
  <Animated.ScrollView ref={sv} onLayout={e=>setHeight(e.nativeEvent.layout.height)} onScrollBeginDrag={manual} showsVerticalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:side,paddingTop:height*.16,paddingBottom:height*.65}} {...(Platform.OS==='web'?{onWheel:manual}:{})}>
   {lines.map((line,i)=><LyricLine key={i} line={line} index={i} state={i<cur?'past':i===cur?'now':'next'} clock={clock} size={size} onLayout={layout} onPress={seek}/>)}
   {credit(source)?<T style={{fontSize:11,opacity:.4,marginTop:30}}>Текст: {credit(source)}</T>:null}
  </Animated.ScrollView>
  <LinearGradient pointerEvents="none" colors={[C.bg+'88',C.bg+'00']} style={{position:'absolute',left:0,right:0,top:0,height:42}}/>
  <LinearGradient pointerEvents="none" colors={[C.bg+'00',C.bg+'aa']} style={{position:'absolute',left:0,right:0,bottom:0,height:safe.bottom+80}}/>
  {!following?<Pressable onPress={()=>setFollowing(true)} accessibilityRole="button" accessibilityLabel="Вернуться к текущей строке" style={{position:'absolute',bottom:safe.bottom+18,alignSelf:'center',paddingHorizontal:20,height:48,borderRadius:24,backgroundColor:C.tx,flexDirection:'row',alignItems:'center',gap:9}}><Icon name="nowBars" size={19} color={C.inverse}/><T style={{fontFamily:F.bold,fontSize:12,color:C.inverse}}>К текущей строке</T></Pressable>:null}
 </View>;
}
