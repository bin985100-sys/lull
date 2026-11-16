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
