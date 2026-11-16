import { resolveThemeValues , useTheme, themeValues } from '@/theme/state';
import { memo } from 'react';
import { SvgXml } from 'react-native-svg';


import { ICON_XML, LOGO_XML, type IconName } from './icon-xml';

export type { IconName };

const accents:Partial<Record<IconName,string>>=themeValues((C) => ({heart:C.rose,heartF:C.rose,download:C.sky,chart:C.gold,shuffle:C.violet}));
export const Icon = memo(function Icon({ name, size = 24, color }: { name: IconName; size?: number; color?: string }) {
  const {colors:C}=useTheme();
 const accents=resolveThemeValues(accentsThemeTable,C);
  return <SvgXml xml={ICON_XML[name]} width={size} height={size} color={color ?? accents[name] ?? C.tx} />;
});

export const Logo = memo(function Logo({ size = 40, color }: { size?: number; color?: string }) {
  const {colors:C}=useTheme();
  return <SvgXml xml={LOGO_XML} width={size} height={size} color={color ?? C.tx} />;
});

const accentsThemeTable=accents;
