import { type ReactNode } from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/state';

/** Painted surfaces only: no backdrop capture, filters or perpetual redraw. */
export function SurfaceScene({children,overlay}:{children:ReactNode;overlay:ReactNode}){
 return <View style={{flex:1}}><View style={{flex:1}}>{children}</View>{overlay}</View>;
}
type Props=ViewProps&{children?:ReactNode;radius?:number;variant?:'regular'|'clear';interactive?:boolean;style?:ViewStyle|ViewStyle[]};
export function Surface({children,radius=24,variant='regular',interactive:_,style,...props}:Props){
 const {colors:C}=useTheme();
 return <View {...props} style={[{zIndex:0,borderRadius:radius,overflow:'hidden',backgroundColor:variant==='clear'?C.s2:C.s1,borderWidth:StyleSheet.hairlineWidth,borderColor:C.line},style]}>{children}</View>;
}
