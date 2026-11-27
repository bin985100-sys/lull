import { type ReactNode, useEffect } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/state';
import { F } from '@/theme/tokens';
import { Icon, type IconName } from '@/ui/Icon';
import { Press, T } from '@/ui/kit';

export const SETTING_TINTS:Partial<Record<IconName,string>>={heart:'#ff8295',heartF:'#ff8295',waves:'#9dc9ff',chart:'#edcd94',clock:'#c2b0ff',queue:'#b3c4ff',playNext:'#a4e8d0',shield:'#9ae2c2',stack:'#9ecbff',download:'#92d9ef',google:'#ebc5a0',eraser:'#eec89e',logout:'#eab7c5',trash:'#ff8295',doc:'#a9bcdf',info:'#aacfe2'};
export function SettingsBadge({icon,tint,size=44}:{icon:IconName;tint?:string;size?:number}){
 const color=tint??SETTING_TINTS[icon]??'#bbbcdf';
 return <View style={{width:size,height:size,borderRadius:size*.38,overflow:'hidden',alignItems:'center',justifyContent:'center'}}><LinearGradient colors={[color+'24',color+'09']} style={{position:'absolute',inset:0}}/><Icon name={icon} size={size*.5} color={color}/></View>;
}
export function SettingsGroup({title,hint,children,step=0}:{title:string;hint?:string;children:ReactNode;step?:number}){
 const {colors:C}=useTheme(),reduced=useReducedMotion();
 return <Animated.View entering={reduced?undefined:FadeInDown.duration(700).delay(Math.min(3,step)*65)} style={{marginTop:30}}>
  <T style={{fontFamily:F.bold,fontSize:18,color:C.tx,marginBottom:hint?5:10}}>{title}</T>
  {hint?<T style={{fontSize:12,lineHeight:19,color:C.tx3,marginBottom:12}}>{hint}</T>:null}
  <View style={{gap:2}}>{children}</View>
 </Animated.View>;
}
export function SettingsChoice({label,hint,icon,tint,selected,onPress}:{label:string;hint:string;icon:IconName;tint:string;selected:boolean;onPress:()=>void}){
 const {colors:C}=useTheme(),reduced=useReducedMotion(),progress=useSharedValue(selected?1:0);
 useEffect(()=>{progress.set(reduced?(selected?1:0):withTiming(selected?1:0,{duration:520}));},[selected,reduced,progress]);
 const color=useAnimatedStyle(()=>({opacity:.2+progress.get()*.8}));
 const check=useAnimatedStyle(()=>({opacity:progress.get(),transform:[{scale:.7+.3*progress.get()}]}));
 return <Press accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked:selected}} aria-checked={selected} onPress={onPress} outer={{flexGrow:1,flexBasis:'44%',minWidth:0}} style={{minHeight:154,padding:17,borderRadius:30,overflow:'hidden',backgroundColor:C.bg,gap:16,justifyContent:'space-between'}}>
  <Animated.View pointerEvents="none" style={[{position:'absolute',inset:0},color]}><LinearGradient colors={[tint+'27',tint+'06',C.bg]} start={{x:0,y:0}} end={{x:1,y:1}} style={{position:'absolute',inset:0}}/></Animated.View>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Icon name={icon} size={25} color={tint}/><Animated.View style={check}><Icon name="check" size={21} color={C.tx}/></Animated.View></View>
  <View style={{gap:5,minWidth:0}}><T style={{fontSize:14,fontFamily:selected?F.bold:F.semi,color:C.tx}}>{label}</T><T style={{fontSize:11,lineHeight:17,color:C.tx3}}>{hint}</T></View>
 </Press>;
}
