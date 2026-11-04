import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

/* Нативно: размытие считает система один раз на обложку */
export function TintLayer({ uri }: { uri: string }) {
  return <Image source={{ uri }} style={[StyleSheet.absoluteFill, { transform: [{ scale: 1.3 }] }]} blurRadius={60} contentFit="cover" />;
}
