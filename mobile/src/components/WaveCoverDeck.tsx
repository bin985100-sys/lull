import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureDetector, useLongPressGesture, usePanGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { Track } from '@/api/audius';
import { F } from '@/theme/tokens';
import { Cover, haptic, T } from '@/ui/kit';
import { deckPose, nearestSlot, visibleSlots, wrapIndex } from '@/ui/deck-math';

type PickKind='pick'|'tap';
type Props={tracks:Track[];activeIndex:number;compact?:boolean;onSelect:(track:Track,kind:PickKind)=>void;onPreview:(track:Track)=>void};
const spring={damping:22,stiffness:145,mass:1};
export function WaveCoverDeck({tracks,activeIndex,compact=false,onSelect,onPreview}:Props){
 const reduced=useReducedMotion(),[width,setWidth]=useState(400),[cursor,setCursor]=useState({value:activeIndex,data:tracks}),[expanded,setExpanded]=useState(false),[keyboardFocus,setKeyboardFocus]=useState(false),[frozen,setFrozen]=useState<Track[]|null>(null);
 const data=frozen??tracks,slot=cursor.data===data?cursor.value:nearestSlot(activeIndex,cursor.value,data.length),size=Math.min(compact?184:246,Math.max(132,width*.54)),height=size+(compact?48:62);
 const position=useSharedValue(activeIndex),circle=useSharedValue(0),origin=useSharedValue(activeIndex),total=useSharedValue(data.length),moving=useSharedValue(false),overview=useSharedValue(false),done=useSharedValue(false),touching=useSharedValue(false),holdDistance=useSharedValue(15);
 const input=useRef({data,onSelect,onPreview}),release=useRef<ReturnType<typeof setTimeout>|null>(null),signature=useRef('');
 useLayoutEffect(()=>{input.current={data,onSelect,onPreview};total.set(data.length);},[data,onSelect,onPreview,total]);
 useLayoutEffect(()=>{if(frozen||touching.get())return;const key=tracks.map(t=>t.id).join('|'),changed=signature.current!==key;signature.current=key;const target=nearestSlot(activeIndex,position.get(),tracks.length);position.set(changed||reduced?target:withSpring(target,spring));},[activeIndex,tracks,frozen,position,reduced,touching]);
 useEffect(()=>()=>{if(release.current)clearTimeout(release.current);},[]);
 const freeze=useCallback(()=>{setKeyboardFocus(false);if(release.current)clearTimeout(release.current);setFrozen(input.current.data);},[]);
 const reveal=useCallback(()=>{setExpanded(true);haptic();},[]);
 const finish=useCallback((value:number,choose:boolean,kind:PickKind='pick')=>{const rows=input.current.data,track=rows[wrapIndex(value,rows.length)];if(choose&&track){haptic();input.current.onSelect(track,kind);}if(release.current)clearTimeout(release.current);release.current=setTimeout(()=>{setExpanded(false);setFrozen(null);release.current=null;},reduced?0:620);},[reduced]);
 const preview=useCallback((value:number)=>{const rows=input.current.data;setCursor({value,data:rows});const track=rows[wrapIndex(value,rows.length)];if(track)input.current.onPreview(track);},[]);
 useAnimatedReaction(()=>Math.round(position.get()),(next,previous)=>{if(next!==previous)scheduleOnRN(preview,next);});
 useEffect(()=>{const track=data[wrapIndex(slot,data.length)];if(track)onPreview(track);},[data,slot,onPreview]);
 const complete=(choose:boolean,kind:PickKind='pick')=>{'worklet';if(done.get())return;done.set(true);touching.set(false);holdDistance.set(15);const target=Math.round(position.get());position.set(reduced?target:withSpring(target,spring));overview.set(false);circle.set(reduced?0:withTiming(0,{duration:600,easing:Easing.bezier(.22,.8,.2,1)}));scheduleOnRN(finish,target,choose,kind);};
 const pan=usePanGesture({activeOffsetX:[-8,8],failOffsetY:[-14,14],maxPointers:1,enableTrackpadTwoFingerGesture:true,
  onBegin:()=>{'worklet';origin.set(position.get());moving.set(false);done.set(false);touching.set(true);holdDistance.set(15);scheduleOnRN(freeze);},
  onActivate:()=>{'worklet';moving.set(true);},
  onUpdate:e=>{'worklet';position.set(origin.get()-e.translationX/(overview.get()?Math.max(42,size*.25):size*.69));},
  onDeactivate:e=>{'worklet';if(!overview.get())complete(!e.canceled);},
  onFinalize:()=>{'worklet';if(!moving.get()&&!overview.get()&&!done.get()){touching.set(false);scheduleOnRN(finish,Math.round(position.get()),false,'pick');}}
 });
 const hold=useLongPressGesture({minDuration:440,maxDistance:holdDistance,shouldCancelWhenOutside:false,
  onActivate:()=>{'worklet';if(moving.get())return;overview.set(true);holdDistance.set(10000);circle.set(reduced?1:withTiming(1,{duration:620,easing:Easing.bezier(.22,.8,.2,1)}));scheduleOnRN(reveal);},
  onDeactivate:e=>{'worklet';if(overview.get())complete(!e.canceled);}
 });
 const tap=useTapGesture({maxDuration:300,maxDeltaX:8,maxDeltaY:8,onDeactivate:e=>{'worklet';if(e.canceled||done.get())return;const target=Math.round(position.get())+Math.round((e.x-width/2)/(size*.69));position.set(reduced?target:withSpring(target,spring));complete(true,'tap');}});
 const gesture=useSimultaneousGestures(pan,hold,tap),selected=data[wrapIndex(slot,data.length)];
 const choose=useCallback((delta:number)=>{const target=slot+delta;position.set(reduced?target:withSpring(target,spring));finish(target,true);},[slot,position,reduced,finish]);
 if(!selected)return null;
 return <View style={{width:'100%',alignItems:'center'}}>
  <GestureDetector gesture={gesture} touchAction="pan-y" userSelect="none" enableContextMenu={false}>
   <View testID="wave-cover-deck" accessible accessibilityRole="adjustable" accessibilityLabel="Обложки волны" accessibilityHint="Свайп — следующий трек. Удерживайте для кругового обзора и отпустите для выбора." accessibilityValue={{min:1,max:data.length,now:wrapIndex(slot,data.length)+1,text:selected.title+', '+selected.artist}} aria-valuemin={1} aria-valuemax={data.length} aria-valuenow={wrapIndex(slot,data.length)+1} aria-valuetext={selected.title+', '+selected.artist}
    accessibilityActions={[{name:'increment'},{name:'decrement'},{name:'activate'}]} onAccessibilityAction={e=>choose(e.nativeEvent.actionName==='increment'?1:e.nativeEvent.actionName==='decrement'?-1:0)}
    {...(Platform.OS==='web'?{tabIndex:0,onFocus:(event:unknown)=>{const target=(event as {currentTarget?:{matches?:(selector:string)=>boolean}}).currentTarget;setKeyboardFocus(!!target?.matches?.(':focus-visible'));},onBlur:()=>setKeyboardFocus(false),onKeyDown:(event:unknown)=>{const e=event as {key?:string;nativeEvent?:{key?:string};preventDefault():void},key=e.key??e.nativeEvent?.key;if(['ArrowLeft','ArrowRight','Enter',' '].includes(key??'')){e.preventDefault();setKeyboardFocus(true);choose(key==='ArrowLeft'?-1:key==='ArrowRight'?1:0);}}}:{})}
    onLayout={e=>setWidth(e.nativeEvent.layout.width)} style={{width:'100%',height,overflow:'hidden',...(Platform.OS==='web'?{outlineWidth:0}:{})}}>
    {visibleSlots(slot,data.length,expanded).map(virtual=>{const track=data[wrapIndex(virtual,data.length)];return <DeckCover key={track.source+':'+track.id} track={track} slot={virtual} position={position} circle={circle} count={total} width={width} size={size} height={height} focused={keyboardFocus&&virtual===slot}/>;})}
   </View>
  </GestureDetector>
  <View style={{height:52,justifyContent:'center',paddingHorizontal:30,width:'100%',alignItems:'center'}}><T numberOfLines={1} style={{fontFamily:F.bold,fontSize:compact?16:19,color:'#fff',letterSpacing:-.5}}>{selected.title}</T><T numberOfLines={1} style={{fontSize:12,color:'rgba(255,255,255,.7)',marginTop:4}}>{selected.artist}</T></View>
 </View>;
}
const DeckCover=memo(function DeckCover({track,slot,position,circle,count,width,size,height,focused}:{track:Track;slot:number;position:SharedValue<number>;circle:SharedValue<number>;count:SharedValue<number>;width:number;size:number;height:number;focused:boolean}){
 const style=useAnimatedStyle(()=>{const p=deckPose(slot-position.get(),circle.get(),count.get(),width,size);return {opacity:p.opacity,zIndex:p.z,transform:[{perspective:900},{translateX:p.x},{translateY:p.y},{rotateY:`${p.angleY}deg`},{rotateZ:`${p.angleZ}deg`},{scale:p.scale}]};});
 return <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{position:'absolute',left:(width-size)/2,top:(height-size)/2,width:size,height:size,borderRadius:28,overflow:'hidden',backgroundColor:'#000',borderWidth:focused?2:.7,borderColor:focused?'#fff':'rgba(255,255,255,.23)'},style]}><Cover uri={track.artwork} label={track.title} size="100%" radius={28}/><LinearGradient colors={['rgba(255,255,255,.13)','transparent','rgba(0,0,0,.1)']} style={StyleSheet.absoluteFill}/></Animated.View>;
});

