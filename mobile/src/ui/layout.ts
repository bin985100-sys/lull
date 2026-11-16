import { useWindowDimensions } from 'react-native';

// Window dimensions, not model names: updates on unfolding and split-screen.
export function layoutMetrics(width: number, height: number, fontScale = 1) {
  const rail = width >= 1050 ? 200 : 0;
  const available = Math.max(0, width - rail);
  const maxContent = width >= 1050 ? 1120 : 720;
  const side = Math.max(width < 350 ? 12 : 20, (available - maxContent) / 2);
  const content = Math.max(0, available - side * 2);
  const columns = Math.max(1, Math.min(5, Math.floor((content + 12) / (Math.max(132,132 * fontScale) + 12))));
  return { rail, available, side, content, columns, card: Math.max(0,(content - (columns-1)*12)/columns), landscape: width > height, compact: height < 500 };
}

export function useLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  return layoutMetrics(width,height,fontScale);
}
