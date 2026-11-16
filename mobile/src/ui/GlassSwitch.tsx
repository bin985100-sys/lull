import { useEffect,useRef } from 'react';
import { Platform,Pressable,type PressableProps,StyleSheet,View } from 'react-native';
import { GestureDetector,usePanGesture } from 'react-native-gesture-handler';
import Animated,{useAnimatedStyle,useReducedMotion,useSharedValue,withSpring,withTiming} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '@/theme/state';
import { Glass } from './Glass';
import { haptic } from './kit';

type Props={value:boolean;onValueChange:(value:boolean)=>void;disabled?:boolean;accessibilityLabel:string};
/** A bounded UI-thread thumb drag; changing settings happens once on release. */
export function GlassSwitch({value,onValueChange,disabled=false,accessibilityLabel}:Props){
 const {colors:C}=useTheme(),reduced=useReducedMotion();
 const progress=useSharedValue(value?1:0),pressure=useSharedValue(0),dragging=useSharedValue(false);
 const preventTap=useRef(false);
 useEffect(()=>{progress.set(reduced?(value?1:0):withSpring(value?1:0,{damping:20,stiffness:300}));},[value,progress,reduced]);
 const begin=()=>{preventTap.current=true;};
 const commit=(next:boolean,canceled:boolean)=>{preventTap.current=true;if(!canceled&&next!==value){haptic();onValueChange(next);}setTimeout(()=>{preventTap.current=false;},120);};
 const pan=usePanGesture({enabled:!disabled,minDistance:3,maxPointers:1,cancelsJSResponder:true,
  onActivate:e=>{dragging.set(true);pressure.set(reduced?0:withTiming(1,{duration:100}));progress.set(Math.max(0,Math.min(1,(e.x-14)/24)));scheduleOnRN(begin);},
  onUpdate:e=>progress.set(Math.max(0,Math.min(1,(e.x-14)/24))),
  onDeactivate:e=>{const next=e.canceled?value:progress.get()>=.5;progress.set(reduced?(next?1:0):withSpring(next?1:0,{damping:20,stiffness:300}));pressure.set(withTiming(0,{duration:120}));dragging.set(false);scheduleOnRN(commit,next,e.canceled);},
  onFinalize:e=>{dragging.set(false);pressure.set(0);if(e.canceled)progress.set(value?1:0);},
 });
 const color=useAnimatedStyle(()=>({opacity:progress.get()}));
 const thumb=useAnimatedStyle(()=>({transform:[{translateX:24*progress.get()},{scaleX:1+.12*pressure.get()},{scaleY:1+.04*pressure.get()}]}));
 return <GestureDetector gesture={pan} touchAction="none"><View style={{width:56,height:44,opacity:disabled?.4:1,justifyContent:'center'}}>
  <Pressable disabled={disabled} accessibilityRole="switch" accessibilityLabel={accessibilityLabel} accessibilityState={{checked:value,disabled}} aria-checked={value}
   {...(Platform.OS==='web'?{onKeyDown:(event:Parameters<NonNullable<PressableProps['onKeyDown']>>[0])=>{const key=(event as unknown as {key?:string}).key??(event.nativeEvent as {key?:string}).key;if(!disabled&&(key===' '||key==='Spacebar')){event.preventDefault();haptic();onValueChange(!value);}}}:{})}
   onPressIn={()=>{if(!dragging.get())preventTap.current=false;pressure.set(reduced?0:withTiming(1,{duration:100}));}}
   onPressOut={()=>{if(!dragging.get())pressure.set(withTiming(0,{duration:120}));}}
   onPress={()=>{if(!preventTap.current){haptic();onValueChange(!value);}}} style={{height:44,justifyContent:'center'}}>
   <View style={{height:32,borderRadius:18,overflow:'hidden',backgroundColor:C.s4}}>
    <Glass pointerEvents="none" radius={18} blur={false} style={StyleSheet.absoluteFill}/>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:C.sky,borderRadius:18},color]}/>
    <Animated.View pointerEvents="none" style={[{position:'absolute',left:2,top:2,width:28,height:28,borderRadius:14,backgroundColor:'#fff',boxShadow:[{offsetX:0,offsetY:2,blurRadius:4,color:C.shadow}]},thumb]}><Glass pointerEvents="none" variant="clear" blur={false} radius={14} style={StyleSheet.absoluteFill}/></Animated.View>
   </View>
  </Pressable>
 </View></GestureDetector>;
}
