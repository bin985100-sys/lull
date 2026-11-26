import { useTheme } from '@/theme/state';
import { Image, type ImageSource } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { WaveArt } from '@/ui/WaveArt';
import { T } from '@/ui/kit';
import { F } from '@/theme/tokens';



/** Banner artwork contains its own lettering: always preserve the full frame. */
export function Banner({source, label, radius=24}:{source:ImageSource | number;label?:string;radius?:number}) {
  const {colors:C}=useTheme();
  const reduced=useReducedMotion();
  return <View accessibilityRole={label ? 'image' : undefined} accessibilityLabel={label}
    style={{width:'100%',aspectRatio:16/9,borderRadius:radius,overflow:'hidden',backgroundColor:'#100e15',borderWidth:StyleSheet.hairlineWidth,borderColor:C.glassLine}}>
    {label&&typeof source==='number'?<><WaveArt tone={Array.from(label).reduce((n,c)=>n+c.charCodeAt(0),0)%3}/><View style={{flex:1,padding:24,justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,.2)'}}><T style={{fontSize:30,fontFamily:F.bold,color:'#fff',letterSpacing:-1}}>{label}</T><T style={{fontSize:10,color:'#f2d9eb',letterSpacing:2,marginTop:6}}>МУЗЫКА ТВОЕГО МОМЕНТА</T></View></>:<Image source={source} style={StyleSheet.absoluteFill} contentFit="contain" transition={reduced ? 0 : 220}/> }
  </View>;
}
