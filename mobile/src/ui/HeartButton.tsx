import { Platform, Pressable, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Icon } from './Icon';
import { useTheme } from '@/theme/state';

function Petal({index,progress,color}:{index:number;progress:ReturnType<typeof useSharedValue<number>>;color:string}){
 const style=useAnimatedStyle(()=>{const t=progress.get(),angle=index*Math.PI/3;return {opacity:Math.sin(t*Math.PI),transform:[{translateX:Math.cos(angle)*(10+t*22)},{translateY:Math.sin(angle)*(10+t*22)},{scale:1-t*.7}]};});
 return <Animated.View style={[{position:'absolute',width:5,height:5,borderRadius:3,backgroundColor:color},style]}/>;
}
export function HeartButton({liked,onPress,onLongPress,label,size=28,unlikedColor,testID}:{liked:boolean;onPress:()=>void;onLongPress?:()=>void;label:string;size?:number;unlikedColor?:string;testID?:string}){
 const {colors:C}=useTheme(),reduced=useReducedMotion(),scale=useSharedValue(1),burst=useSharedValue(0);
 const style=useAnimatedStyle(()=>({transform:[{scale:scale.get()}]}));
 return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected:liked}} aria-pressed={liked} accessibilityHint={onLongPress?'Удерживай, чтобы добавить в другой плейлист':undefined} onLongPress={onLongPress} delayLongPress={450} accessibilityActions={onLongPress?[{name:'longpress',label:'Добавить в другой плейлист'}]:undefined} onAccessibilityAction={e=>{if(e.nativeEvent.actionName==='longpress')onLongPress?.();}} {...(Platform.OS==='web'&&onLongPress?{onContextMenu:(event:{preventDefault():void})=>{event.preventDefault();onLongPress();}}:{})} hitSlop={6} onPress={()=>{if(!reduced){scale.set(withSequence(withTiming(.84,{duration:110}),withSpring(liked?1:1.22,{damping:12,stiffness:180}),withSpring(1,{damping:14,stiffness:150})));if(!liked){burst.set(0);burst.set(withTiming(1,{duration:720,easing:Easing.out(Easing.cubic)}));}}onPress();}} style={{width:48,height:48,alignItems:'center',justifyContent:'center'}}>
  <View pointerEvents="none" style={{position:'absolute',inset:0,alignItems:'center',justifyContent:'center'}}>{Array.from({length:6},(_,index)=><Petal key={index} index={index} progress={burst} color={C.rose}/>)}</View>
  <Animated.View style={style}><Icon name={liked?'heartF':'heart'} size={size} color={liked?C.rose:unlikedColor??C.tx2}/></Animated.View>
 </Pressable>;
}
