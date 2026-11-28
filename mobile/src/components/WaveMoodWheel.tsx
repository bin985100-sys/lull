import { useEffect, useRef, type ElementRef } from 'react';
import { Platform, Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { LinearGradient } from 'expo-linear-gradient';
import { WAVE_MODES } from '@/reco/engine';
import type { WaveMode } from '@/store/taste';
import { useTheme } from '@/theme/state';
import { F } from '@/theme/tokens';
import { haptic, T } from '@/ui/kit';

const STEP = 52, HEIGHT = STEP * 5;
function Mood({index,offset,onPress}:{index:number;offset:SharedValue<number>;onPress():void}) {
  const {colors:C} = useTheme(), reduced = useReducedMotion();
  const motion = useAnimatedStyle(() => {
    const distance = Math.max(-2.5,Math.min(2.5,index-offset.get()/STEP)), away = Math.abs(distance);
    return { opacity:Math.max(.12,1-away*.36), transform:[{perspective:600},{rotateX:`${reduced?0:distance*24}deg`},{scale:1-away*.12}] };
  });
  return <Pressable accessibilityRole="button" accessibilityLabel={WAVE_MODES[index].title} onPress={onPress} style={{height:STEP,justifyContent:'center'}}>
    <Animated.View style={motion}><T numberOfLines={1} style={{textAlign:'center',fontSize:23,fontFamily:F.bold,color:C.tx,letterSpacing:-.6}}>{WAVE_MODES[index].title}</T></Animated.View>
  </Pressable>;
}

/** Only six text layers move; the selected mood is committed after settling. */
export function WaveMoodWheel({value,onChange}:{value:WaveMode;onChange(mode:WaveMode):void}) {
  const {colors:C}=useTheme(), reduced=useReducedMotion(), web=Platform.OS==='web';
  const selected=Math.max(0,WAVE_MODES.findIndex(m=>m.id===value)), offset=useSharedValue(selected*STEP);
  const scroll=useRef<ElementRef<typeof ScrollView>>(null), timer=useRef<ReturnType<typeof setTimeout>|null>(null), index=useRef(selected);
  const cancel=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;};
  const commit=(y:number)=>{
    cancel();const next=Math.max(0,Math.min(WAVE_MODES.length-1,Math.round(y/STEP)));
    scroll.current?.scrollTo({y:next*STEP,animated:!reduced});
    if(index.current!==next){index.current=next;haptic();onChange(WAVE_MODES[next].id);}
  };
  const settleLater=(y:number)=>{cancel();timer.current=setTimeout(()=>commit(y),180);};
  const onScroll=useAnimatedScrollHandler({onScroll:event=>{offset.set(event.contentOffset.y);if(web)scheduleOnRN(settleLater,event.contentOffset.y);}});
  useEffect(()=>{index.current=selected;scroll.current?.scrollTo({y:selected*STEP,animated:!reduced});},[selected,reduced]);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  const finish=(event:NativeSyntheticEvent<NativeScrollEvent>)=>commit(event.nativeEvent.contentOffset.y);
  return <View testID="wave-mood-wheel" accessible={!web} accessibilityRole="adjustable" accessibilityLabel="Настроение волны" accessibilityValue={{text:WAVE_MODES[selected].title,min:0,max:WAVE_MODES.length-1,now:selected}}
    accessibilityActions={[{name:'increment',label:'Следующее настроение'},{name:'decrement',label:'Предыдущее настроение'}]}
    onAccessibilityAction={e=>commit((index.current+(e.nativeEvent.actionName==='increment'?1:-1))*STEP)}
    style={{height:HEIGHT,overflow:'hidden'}}>
    <Animated.ScrollView ref={scroll} nestedScrollEnabled showsVerticalScrollIndicator={false} snapToInterval={STEP} decelerationRate="fast" scrollEventThrottle={16}
      onScroll={onScroll} onMomentumScrollBegin={cancel} onMomentumScrollEnd={finish}
      onScrollEndDrag={e=>{const y=e.nativeEvent.contentOffset.y;cancel();timer.current=setTimeout(()=>commit(y),450);}}
      contentOffset={{x:0,y:selected*STEP}} contentContainerStyle={{paddingVertical:STEP*2}} style={{height:HEIGHT}}>
      {WAVE_MODES.map((m,i)=><Mood key={m.id} index={i} offset={offset} onPress={()=>commit(i*STEP)}/>) }
    </Animated.ScrollView>
    <LinearGradient pointerEvents="none" colors={[C.bg,'transparent','transparent',C.bg]} locations={[0,.32,.68,1]} style={{position:'absolute',inset:0}}/>
  </View>;
}
