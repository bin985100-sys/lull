import { useTheme } from '@/theme/state';
import { Image, type ImageSource } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';



/** Banner artwork contains its own lettering: always preserve the full frame. */
export function Banner({source, label, radius=24}:{source:ImageSource | number;label?:string;radius?:number}) {
  const {colors:C}=useTheme();
  const reduced=useReducedMotion();
  return <View accessibilityRole={label ? 'image' : undefined} accessibilityLabel={label}
    style={{width:'100%',aspectRatio:16/9,borderRadius:radius,overflow:'hidden',backgroundColor:'#100e15',borderWidth:StyleSheet.hairlineWidth,borderColor:C.glassLine}}>
    <Image source={source} style={StyleSheet.absoluteFill} contentFit="contain" transition={reduced ? 0 : 220}/>
  </View>;
}
