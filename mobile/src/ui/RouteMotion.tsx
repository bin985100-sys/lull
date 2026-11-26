import { type ReactNode, useEffect, useRef } from 'react';
import { useIsFocused } from 'expo-router';
import { Platform } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { routeExit } from './route-motion-state';
export function routeScreenLayout({children}:{children:ReactNode}){return <RouteMotion>{children}</RouteMotion>;}
function RouteMotion({children}:{children:ReactNode}){
 const focused=useIsFocused(),reduced=useReducedMotion(),progress=useSharedValue(0),direction=useSharedValue(1),seen=useRef(false);
 useEffect(()=>{if(focused){direction.set(seen.current?-1:1);seen.current=true;progress.set(reduced?1:withTiming(1,{duration:560,easing:Easing.bezier(.22,.8,.2,1)}));}else progress.set(reduced?0:withTiming(0,{duration:320}));},[focused,reduced,progress,direction]);
 useEffect(()=>{
  if(Platform.OS!=='web'||!focused)return;
  let timer:ReturnType<typeof setTimeout>|undefined,pending:(()=>void)|undefined;
  const run=(action:()=>void)=>{if(reduced){action();return;}pending=action;if(timer)return;direction.set(1);progress.set(withTiming(0,{duration:260,easing:Easing.bezier(.4,0,.2,1)}));timer=setTimeout(()=>{timer=undefined;const next=pending;pending=undefined;next?.();},260);};
  routeExit.run=run;return()=>{if(routeExit.run===run)routeExit.run=null;if(timer)clearTimeout(timer);};
 },[focused,reduced,progress,direction]);
 const style=useAnimatedStyle(()=>({opacity:reduced?1:.74+.26*progress.get(),transform:[{translateX:reduced?0:(1-progress.get())*18*direction.get()}]}));
 return <Animated.View testID="route-motion" aria-hidden={!focused} accessibilityElementsHidden={!focused} importantForAccessibility={focused?'auto':'no-hide-descendants'} pointerEvents={focused?'auto':'none'} style={[{flex:1},style]}>{children}</Animated.View>;
}
