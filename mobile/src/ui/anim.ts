import { Platform } from 'react-native';
import { Easing, FadeIn, FadeInLeft, FadeInRight, Keyframe } from 'react-native-reanimated';

import { EASE } from '@/theme/tokens';

/* Web presets retain document flow after entry; custom web keyframes pin snapshots. */
export function slideIn(dx: number, scale = 0.94, duration = 460) {
  const easing=Easing.bezier(...EASE);
  if(Platform.OS==='web')return (dx>0?FadeInRight:dx<0?FadeInLeft:FadeIn).duration(duration).easing(easing);
  return new Keyframe({
    0: { opacity: 0, transform: [{ translateX: dx }, { scale }] },
    100: { opacity: 1, transform: [{ translateX: 0 }, { scale: 1 }], easing },
  }).duration(duration);
}
