import { memo } from 'react';
import { SvgXml } from 'react-native-svg';

import { C } from '@/theme/tokens';
import { ICON_XML, LOGO_XML, type IconName } from './icon-xml';

export type { IconName };

export const Icon = memo(function Icon({ name, size = 24, color = C.tx }: { name: IconName; size?: number; color?: string }) {
  return <SvgXml xml={ICON_XML[name]} width={size} height={size} color={color} />;
});

export const Logo = memo(function Logo({ size = 40, color = C.tx }: { size?: number; color?: string }) {
  return <SvgXml xml={LOGO_XML} width={size} height={size} color={color} />;
});
