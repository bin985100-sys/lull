import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import type { AmbientProps } from './AmbientMotion';
const drift={from:{transform:[{translateX:-10},{translateY:8},{rotate:'-3deg'}]},to:{transform:[{translateX:10},{translateY:-8},{rotate:'3deg'}]}};
/** Browser compositor keyframes; no JS timer or requestAnimationFrame loop. */
export function AmbientMotion({children,active,duration=14000,mirror=false,cover=false}:AmbientProps){
 return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,{transform:[{scaleX:(mirror?-1:1)*(cover?1.18:1.22)},{scaleY:cover?1.18:1.22}]}]}><Animated.View style={[StyleSheet.absoluteFill,{animationName:drift,animationDuration:duration,animationIterationCount:'infinite',animationDirection:'alternate',animationTimingFunction:'ease-in-out',animationPlayState:active?'running':'paused'}]}>{children}</Animated.View></Animated.View>;
}
