import { pull } from '@/api/sync';
import { resetTo } from '@/nav';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { cancelLogin, login, openAuthUrl, useAuthWait, type Provider } from '@/api/auth';
import { useLibrary } from '@/store/library';
import { C } from '@/theme/tokens';
import { Logo } from '@/ui/Icon';
import { Btn, Screen, T } from '@/ui/kit';
import { toast } from '@/ui/overlay';

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

/* после входа сначала забираем библиотеку с сервера: на новом телефоне сразу вернутся любимые и настройки */
export const afterLogin = async () => {
  try { await Promise.race([pull(), new Promise((r) => setTimeout(r, 6000))]); } catch {}
  resetTo(useLibrary.getState().onboarded ? '/listen' : '/onboarding');
};

export default function Welcome() {
  const { wait, error } = useAuthWait();
  const [busy, setBusy] = useState<Provider | null>(null);
  useEffect(() => { if (error) toast(error, 'info'); }, [error]);
  const go = async (p: Provider) => {
    if (busy) return;
    setBusy(p);
    try { await login(p, afterLogin); } catch (e: any) { toast(e?.message || 'Не получилось начать вход', 'info'); }
    setBusy(null);
  };
  return (
    <Screen dock={false} scroll={false}>
      <Logo size={40} />
      <Mark />
      <T v="xl" accessibilityRole="header">{'Ближе\nк музыке.'}</T>
      <View style={{ flex: 1, minHeight: 28 }} />
      {wait ? (
        <Animated.View entering={FadeIn.duration(250)} style={{ gap: 12 }} accessibilityLiveRegion="polite">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 26, backgroundColor: C.s1 }}>
            <ActivityIndicator color={C.tx} />
            <View style={{ flex: 1 }}>
              <T>{wait.provider === 'telegram' ? 'Ждём подтверждения в Telegram' : 'Ждём подтверждения в Google'}</T>
              <T v="small" style={{ marginTop: 2 }}>{wait.provider === 'telegram' ? 'Нажми «Старт» в боте и вернись сюда' : 'Выбери аккаунт и вернись сюда'}</T>
            </View>
          </View>
          <Btn label={wait.provider === 'telegram' ? 'Открыть Telegram ещё раз' : 'Открыть Google ещё раз'} icon={wait.provider === 'telegram' ? 'telegram' : 'google'} kind="dark" onPress={() => openAuthUrl(wait.url, wait.provider)} />
          <Pressable onPress={cancelLogin} accessibilityRole="button" style={{ alignSelf: 'center', padding: 12 }}><T v="sub">Отмена</T></Pressable>
        </Animated.View>
      ) : (
        <View style={{ gap: 12 }}>
          <Btn label="Продолжить с Google" icon="google" disabled={!!busy} onPress={() => go('google')} />
          <Btn label="Продолжить с Telegram" icon="telegram" kind="dark" disabled={!!busy} onPress={() => go('telegram')} />
        </View>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  g: { position: 'absolute', width: '64%', height: '64%', borderRadius: 48, borderWidth: 26, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.03)' },
});
