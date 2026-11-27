import { type ReactNode, useCallback } from 'react';
import { View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '@/theme/state';
import { Icon } from './Icon';
import { haptic } from './kit';
import { queueSwipeOffset, shouldQueueSwipe } from './queue-swipe';

export function SwipeToQueue({children,onQueue,onSwipeState}:{children:ReactNode;onQueue:()=>void;onSwipeState?:(active:boolean)=>void}){
 const {colors:C}=useTheme(),reduced=useReducedMotion(),x=useSharedValue(0),armed=useSharedValue(false),pulse=useSharedValue(0),dragging=useSharedValue(false);
 const commit=useCallback(()=>{haptic();onQueue();},[onQueue]);
 const notify=useCallback((active:boolean)=>onSwipeState?.(active),[onSwipeState]);
 const pan=usePanGesture({activeOffsetX:14,failOffsetX:-10,failOffsetY:[-12,12],maxPointers:1,
  onActivate:()=>{'worklet';dragging.set(true);scheduleOnRN(notify,true);},
  onUpdate:e=>{'worklet';x.set(queueSwipeOffset(e.translationX));const ready=shouldQueueSwipe(e.translationX,false);if(ready&&!armed.get())scheduleOnRN(haptic);armed.set(ready);},
  onDeactivate:e=>{'worklet';if(shouldQueueSwipe(e.translationX,e.canceled)){pulse.set(reduced?0:withSequence(withTiming(1,{duration:110}),withTiming(0,{duration:240})));scheduleOnRN(commit);}},
  onFinalize:()=>{'worklet';if(dragging.get()){scheduleOnRN(notify,false);dragging.set(false);}armed.set(false);x.set(reduced?0:withSpring(0,{damping:24,stiffness:240,mass:.8}));}
 });
 const row=useAnimatedStyle(()=>({transform:[{translateX:x.get()}]}));
 const badge=useAnimatedStyle(()=>({opacity:Math.min(1,x.get()/42)+pulse.get()*.05,transform:[{scale:reduced?1:.7+Math.min(1,x.get()/74)*.3+pulse.get()*.15}]}));
 return <View testID="swipe-to-queue" style={{position:'relative'}}>
  <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{position:'absolute',left:0,top:9,bottom:9,width:58,borderRadius:29,backgroundColor:C.violet+'26',justifyContent:'center',alignItems:'center'},badge]}><Icon name="queue" size={27} color={C.violet}/></Animated.View>
  <GestureDetector gesture={pan} touchAction="pan-y"><Animated.View style={row}>{children}</Animated.View></GestureDetector>
 </View>;
}
