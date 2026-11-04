import { useEffect } from 'react';
import Animated, { useAnimatedProps, useSharedValue, withTiming, Easing, useReducedMotion } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { C, EASE } from '@/theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/* Треугольник «запуск», разрезанный на две половины, переливается в две полосы «паузы».
   У обеих форм одинаковое число точек, поэтому их можно линейно интерполировать. */
const PLAY = [
  [6.6, 4.9, 13, 8.6, 13, 15.4, 6.6, 19.1],
  [13, 8.6, 19.2, 12, 19.2, 12, 13, 15.4],
];
const PAUSE = [
  [6.2, 4.6, 10.1, 4.6, 10.1, 19.4, 6.2, 19.4],
  [13.9, 4.6, 17.8, 4.6, 17.8, 19.4, 13.9, 19.4],
];

function shape(a: number[], b: number[], t: number) {
  'worklet';
  let d = 'M';
  for (let i = 0; i < a.length; i += 2) {
    const x = a[i] + (b[i] - a[i]) * t;
    const y = a[i + 1] + (b[i + 1] - a[i + 1]) * t;
    d += (i ? ' L' : '') + x.toFixed(2) + ' ' + y.toFixed(2);
  }
  return d + ' Z';
}

export function PlayPause({ playing, size = 26, color = C.tx, stroke = 2.2 }: { playing: boolean; size?: number; color?: string; stroke?: number }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(playing ? 1 : 0);
  useEffect(() => {
    t.value = reduced ? (playing ? 1 : 0) : withTiming(playing ? 1 : 0, { duration: 320, easing: Easing.bezier(...EASE) });
  }, [playing, reduced, t]);
  const left = useAnimatedProps(() => ({ d: shape(PLAY[0], PAUSE[0], t.value) }));
  const right = useAnimatedProps(() => ({ d: shape(PLAY[1], PAUSE[1], t.value) }));
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <AnimatedPath animatedProps={left} fill={color} stroke={color} strokeWidth={stroke} strokeLinejoin="round" />
      <AnimatedPath animatedProps={right} fill={color} stroke={color} strokeWidth={stroke} strokeLinejoin="round" />
    </Svg>
  );
}
