export const R = { card: 28, panel: 34, pill: 999, cover: 20 } as const;

export const F = {
  medium: 'Manrope_500Medium',
  semi: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  heavy: 'Manrope_800ExtraBold',
} as const;

export const DOCK = { compact: 84, mini: 158, side: 12 } as const;

/* Плавности как в прототипе: cubic-bezier(.22,.8,.2,1) */
export const EASE = [0.22, 0.8, 0.2, 1] as const;
