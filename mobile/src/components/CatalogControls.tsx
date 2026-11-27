import { type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { useCoverColors } from '@/theme/useCoverColors';
import { F } from '@/theme/tokens';
import { WaveArt } from '@/ui/WaveArt';
import { Icon, type IconName } from '@/ui/Icon';
import { Press, T } from '@/ui/kit';
import { PlayPause } from '@/ui/PlayPause';
import { softExit } from '@/nav';

export function CatalogIconButton({name,label,onPress,disabled=false,size=48}:{name:IconName;label:string;onPress:()=>void;disabled?:boolean;size?:number}){
 return <Press accessibilityRole="button" accessibilityLabel={label} disabled={disabled} outer={{width:size,height:size}} style={{width:size,height:size,borderRadius:size/2,alignItems:'center',justifyContent:'center',opacity:disabled?.35:1}} onPress={onPress}><Icon name={name} size={28} color="#fff"/></Press>;
}
export function CatalogTopBar({right}:{right?:ReactNode}){
 return <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',minHeight:52}}><CatalogIconButton name="back" label="Назад" onPress={()=>softExit(()=>router.canGoBack()?router.back():router.replace('/listen'))}/>{right}</View>;
}
export function CoverPlayButton({artwork,seed,playing,disabled,onPress,visible=true}:{artwork?:string;seed:string;playing:boolean;disabled:boolean;onPress:()=>void;visible?:boolean}){
 const colors=useCoverColors(artwork,seed),focused=useIsFocused(),compact=useWindowDimensions().width<350;
 return <Press testID="cover-play-button" accessibilityRole="button" accessibilityLabel={playing?'Пауза':'Слушать'} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} outer={{flex:1,minWidth:104}} style={{minHeight:60,borderRadius:999,overflow:'hidden',justifyContent:'center',opacity:disabled?.35:1}}>
  <WaveArt animate={focused&&visible&&!disabled} colors={colors}/>
  <View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:'#00000030'}]}/>
  <View style={{paddingHorizontal:compact?10:14,paddingVertical:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:compact?8:10}}><PlayPause playing={playing} size={compact?22:24} color="#fff"/><T style={{fontFamily:F.bold,color:'#fff',fontSize:compact?14:16,textShadowColor:'#0008',textShadowRadius:7}}>{playing?'Пауза':'Слушать'}</T></View>
 </Press>;
}
export function trackCountLabel(n:number){const last=n%10,lastTwo=n%100;return `${n} ${last===1&&lastTwo!==11?'трек':last>=2&&last<=4&&(lastTwo<12||lastTwo>14)?'трека':'треков'}`;}
