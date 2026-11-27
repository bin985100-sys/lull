import { memo, type ReactNode, useEffect, useId, useState } from 'react';
import { AppState, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { ClipPath, Defs, Image, Path, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Animated, { cancelAnimation, Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import type { Artist } from '@/api/audius';
import { useAppearance } from '@/theme/state';
import { F } from '@/theme/tokens';
import { Press, T } from '@/ui/kit';
import { WelcomeProviderButton, WelcomeScene } from './WelcomeScene';
import { DISCOVERY_PORTRAITS } from './discovery-portraits';

const ease=Easing.bezier(.22,.72,.18,1);
const flightEase=Easing.bezier(.58,.03,.19,1),FLIGHT_MS=1480,FLIGHT_DELAY=80;
// Rounded silhouettes in a shared coordinate system; images stay inside their shape.
const SHAPES=[
 'M50 0C78 0 100 22 100 50S78 100 50 100 0 78 0 50 22 0 50 0Z',
 'M28 0H72Q100 0 100 28V72Q100 100 72 100H28Q0 100 0 72V28Q0 0 28 0Z',
 'M50 0C78 0 100 22 100 50V80Q100 100 80 100H20Q0 100 0 80V50C0 22 22 0 50 0Z',
 'M50 12C85-18 118 15 88 50C118 85 85 118 50 88C15 118-18 85 12 50C-18 15 15-18 50 12Z',
 'M50 0Q59 0 65 6L94 35Q106 50 94 65L65 94Q50 106 35 94L6 65Q-6 50 6 35L35 6Q41 0 50 0Z',
 'M23 3Q37-4 50 6Q63-4 77 3Q94 7 94 25Q108 37 98 51Q108 66 94 78Q94 96 76 97Q62 107 49 96Q34 107 21 97Q3 96 5 77Q-8 64 3 50Q-8 36 5 23Q4 7 23 3Z',
];
const Portrait=memo(function Portrait({artist,index,width,top,size,clock,arrival}:{artist:{id:string;avatar?:string;portrait?:number};index:number;width:number;top:number;size:number;clock:SharedValue<number>;arrival:SharedValue<number>}){
 const id=useId().replace(/[^\w-]/g,'');
 const style=useAnimatedStyle(()=>{
  const row=Math.floor(index/4),slot=index%4,t=(clock.get()+slot/4+row*.13)%1;
  const settle=1-Math.max(0,(arrival.get()-row*.045)/(1-row*.045));
  return {transform:[{translateX:(row%2?1-t:t)*(width+size*2)-size*1.5},{translateY:Math.sin(t*Math.PI*2+index)*12+settle*size*(.4+row*.25)},{rotate:`${Math.sin(t*Math.PI*2+index)*7}deg`}]};
 });
 return <Animated.View testID="discovery-portrait" style={[{position:'absolute',left:0,top,width:size,height:size},style]}>
  <Svg width={size} height={size} viewBox="0 0 100 100"><Defs><ClipPath id={id}><Path d={SHAPES[index%SHAPES.length]}/></ClipPath></Defs><Rect width={100} height={100} fill="#191319" clipPath={`url(#${id})`}/><Image href={artist.portrait??{uri:artist.avatar!}} width={100} height={100} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id})`}/></Svg>
 </Animated.View>;
});

export function ArtistDiscoveryScene({artists,choosing,onChoose,onSkip,children}:{artists:Artist[];choosing:boolean;onChoose:()=>void;onSkip:()=>void;children:ReactNode}){
 const {width,height,fontScale}=useWindowDimensions(),safe=useSafeAreaInsets(),focused=useIsFocused(),reduced=useReducedMotion(),motion=useAppearance(s=>s.motion);
 const [foreground,setForeground]=useState(AppState.currentState==='active'),[arriving,setArriving]=useState(true),[invited,setInvited]=useState(false),[ready,setReady]=useState(false);
 const arrival=useSharedValue(0),clock=useSharedValue(0),invite=useSharedValue(0),descent=useSharedValue(0),cta=useSharedValue(0);
 const still=reduced||!motion,live=focused&&foreground&&!still&&!choosing;
 useEffect(()=>{const sub=AppState.addEventListener('change',s=>setForeground(s==='active'));return()=>sub.remove();},[]);
 useEffect(()=>{
  arrival.set(still?1:withDelay(FLIGHT_DELAY,withTiming(1,{duration:FLIGHT_MS,easing:flightEase})));
  const timer=setTimeout(()=>setArriving(false),still?0:FLIGHT_DELAY+FLIGHT_MS+80),button=setTimeout(()=>{setReady(true);cta.set(still?1:withTiming(1,{duration:850,easing:ease}));},still?0:1950);
  return()=>{clearTimeout(timer);clearTimeout(button);cancelAnimation(arrival);cancelAnimation(cta);};
 },[arrival,cta,still]);
 useEffect(()=>{cancelAnimation(clock);if(live)clock.set(withRepeat(withTiming(clock.get()+1,{duration:38000,easing:Easing.linear}),-1,false));return()=>cancelAnimation(clock);},[clock,live]);
 useEffect(()=>{invite.set(still?(invited?1:0):withTiming(invited?1:0,{duration:1000,easing:ease}));},[invite,invited,still]);
 useEffect(()=>{descent.set(still?(choosing?1:0):withTiming(choosing?1:0,{duration:1100,easing:ease}));},[choosing,descent,still]);
 // Two adjacent full-size scenes travel as one vertical canvas: no zoom or black flash.
 const launch=useAnimatedStyle(()=>({transform:[{translateY:-height*arrival.get()}]}));
 const universe=useAnimatedStyle(()=>({opacity:1-descent.get(),transform:[{translateY:height*(1-arrival.get())-height*.38*descent.get()},{scale:1-.08*descent.get()}]}));
 const heading=useAnimatedStyle(()=>({transform:[{translateY:invite.get()*-18}]}));
 const field=useAnimatedStyle(()=>({transform:[{translateY:invite.get()*-24},{scale:1-invite.get()*.06}]}));
 const action=useAnimatedStyle(()=>({opacity:cta.get(),transform:[{translateY:(1-cta.get())*24}]}));
 const picker=useAnimatedStyle(()=>({opacity:descent.get(),transform:[{translateY:(1-descent.get())*Math.min(300,height*.4)},{scale:.94+.06*descent.get()}]}));
 const landscape=width>height*1.25,available=artists.filter(a=>a.avatar);
 const portraits=(available.length>=8?available:DISCOVERY_PORTRAITS).slice(0,landscape?4:12);
 const size=landscape?Math.min(90,height*.2):Math.min(148,Math.max(66,Math.min(width/3.5,(height-safe.top-safe.bottom-280)/3.5))),fieldTop=landscape?height*.36:height*.31,rowGap=size*1.16;
 // CSS clip forbids focus-driven scrolling of this moving stage; native uses hidden.
 const overflow=Platform.OS==='web'?'clip' as 'hidden':'hidden';
 return <View testID="artist-discovery-scene" style={{flex:1,backgroundColor:'#000',overflow}}>
  {focused?<StatusBar style="light"/>:null}
  <Animated.View pointerEvents={choosing?'auto':'none'} aria-hidden={!choosing} accessibilityElementsHidden={!choosing} importantForAccessibility={choosing?'auto':'no-hide-descendants'} style={[StyleSheet.absoluteFill,picker]}>{choosing?children:null}</Animated.View>
  <Animated.View testID="onboarding-arrival" pointerEvents={choosing||arriving?'none':'auto'} aria-hidden={choosing||arriving} accessibilityElementsHidden={choosing||arriving} style={[StyleSheet.absoluteFill,universe]}>
   <Animated.View style={[{position:'absolute',top:safe.top+Math.max(26,height*.09),left:24,right:24,alignItems:'center'},heading]}>
    <Animated.View key={String(invited)} entering={still?undefined:FadeIn.duration(850)}><T accessibilityRole="header" style={{color:'#fff',fontFamily:F.bold,fontSize:Math.min(44,width*.096)/Math.max(1,fontScale*.8),lineHeight:Math.min(50,width*.112),textAlign:'center',letterSpacing:-1}}>{invited?'С кого начнётся\nтвоя волна?':'Открывай своё\nзвучание'}</T></Animated.View>
   </Animated.View>
   <Animated.View pointerEvents="none" accessibilityElementsHidden style={[StyleSheet.absoluteFill,field]}>
    {portraits.map((artist,i)=><Portrait key={artist.id} artist={artist} index={i} width={width} top={fieldTop+Math.floor(i/4)*rowGap} size={size} clock={clock} arrival={arrival}/>)}
   </Animated.View>
   <LinearGradient pointerEvents="none" colors={['#00000000','#000','#000']} locations={[0,.65,1]} style={{position:'absolute',bottom:0,left:0,right:0,height:safe.bottom+180}}/>
   <Animated.View style={[{position:'absolute',bottom:safe.bottom+20,left:24,right:24,alignItems:'center',gap:10,paddingTop:14,borderRadius:36},action]}>
    <Press testID="discovery-choose" accessibilityRole="button" accessibilityLabel={invited?'Выбрать артистов':'Выбрать'} disabled={!ready} onPress={()=>invited?onChoose():setInvited(true)} outer={{width:'100%',maxWidth:380}} style={{minHeight:58,alignItems:'center',justifyContent:'center',paddingHorizontal:24,borderRadius:40,backgroundColor:'#fff'}}><T style={{color:'#000',fontFamily:F.bold,fontSize:17}}>{invited?'Выбрать артистов':'Выбрать'}</T></Press>
    <Press accessibilityRole="button" accessibilityLabel="Пропустить выбор артистов" onPress={onSkip} style={{minHeight:44,padding:12}}><T style={{color:'#ffffff99',fontSize:14}}>Пропустить</T></Press>
   </Animated.View>
  </Animated.View>
  {arriving?<Animated.View testID="onboarding-departure" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill,launch]}><WelcomeScene><WelcomeProviderButton provider="google" disabled onPress={()=>{}}/><WelcomeProviderButton provider="telegram" disabled onPress={()=>{}}/></WelcomeScene></Animated.View>:null}
 </View>;
}
