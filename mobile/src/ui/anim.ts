import { Easing, withTiming } from 'react-native-reanimated';

import { EASE } from '@/theme/tokens';

/* Вход при смене трека: съезжает со стороны переключения и чуть подрастает */
export function slideIn(dx: number, scale = 0.94, duration = 460) {
  return () => {
    'worklet';
    const cfg = { duration, easing: Easing.bezier(EASE[0], EASE[1], EASE[2], EASE[3]) };
    return {
      initialValues: { opacity: 0, transform: [{ translateX: dx }, { scale }] },
      animations: { opacity: withTiming(1, cfg), transform: [{ translateX: withTiming(0, cfg) }, { scale: withTiming(1, cfg) }] },
    };
  };
}
