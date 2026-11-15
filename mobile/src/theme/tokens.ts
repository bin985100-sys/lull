/* Токены из прототипа v2. Тёмная тема — единственная: продукт про ночь и обложки. */
export const C = {
  bg: '#000000',
  s1: '#121315',
  s2: '#1a1c1f',
  s3: '#24272b',
  s4: '#30343a',
  line: 'rgba(255,255,255,0.07)',
  tx: '#f5f5f4',
  tx2: '#9ba0a7',
  tx3: '#6f747b',
  glass: 'rgba(34,36,40,0.66)',
  glassLine: 'rgba(255,255,255,0.07)',
  danger: '#ffb4a8',
} as const;

export const R = { card: 26, panel: 36, pill: 999, cover: 12 } as const;

export const F = {
  medium: 'Montserrat_500Medium',
  semi: 'Montserrat_600SemiBold',
  bold: 'Montserrat_700Bold',
  heavy: 'Montserrat_800ExtraBold',
} as const;

export const DOCK = { compact: 78, mini: 152, side: 12 } as const;

/* Плавности как в прототипе: cubic-bezier(.22,.8,.2,1) */
export const EASE = [0.22, 0.8, 0.2, 1] as const;
