import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useLibrary } from '@/store/library';
import { Logo } from '@/ui/Icon';
import { Btn, Screen, T } from '@/ui/kit';

/* Две стеклянные рамки из знака: медленно покачиваются навстречу друг другу */
function Mark() {
  const t = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => { if (!reduced) t.value = withRepeat(withTiming(1, { duration: 3500, easing: Easing.inOut(Easing.sin) }), -1, true); }, [reduced, t]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * 4 }, { translateY: t.value * -4 }, { rotate: `${t.value * 1.5}deg` }] }));
  const b = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * -4 }, { translateY: t.value * 4 }, { rotate: `${t.value * -1.5}deg` }] }));
  return (
    <View style={{ width: 250, height: 250, alignSelf: 'center', marginTop: 34, marginBottom: 30 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[st.g, { left: 0, bottom: 0 }, a]} />
      <Animated.View style={[st.g, { right: 0, top: 0 }, b]} />
    </View>
  );
}

export default function Welcome() {
  const lib = useLibrary();
  const login = (provider: 'Google' | 'Apple') => {
    /* Настоящий вход подключим вместе с бэкендом аккаунтов; пока профиль локальный */
    lib.setAccount({ provider, name: lib.account.name || 'Слушатель' });
    router.replace(lib.onboarded ? '/listen' : '/onboarding');
  };
  return (
    <Screen dock={false} scroll={false}>
      <Logo size={40} />
      <Mark />
      <T v="xl" accessibilityRole="header">{'Ближе\nк музыке.'}</T>
      <View style={{ flex: 1, minHeight: 28 }} />
      <View style={{ gap: 12 }}>
        <Btn label="Продолжить с Google" icon="google" onPress={() => login('Google')} />
        <Btn label="Продолжить с Apple" icon="apple" kind="dark" onPress={() => login('Apple')} />
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  g: { position: 'absolute', width: '64%', height: '64%', borderRadius: 48, borderWidth: 26, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.03)' },
});
