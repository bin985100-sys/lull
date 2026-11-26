import { useTheme } from '@/theme/state';
import { finishLogin, useSession } from '@/api/session';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { cancelLogin, login, openAuthUrl, useAuthWait, type Provider } from '@/api/auth';
import { useLibrary } from '@/store/library';

import { Logo } from '@/ui/Icon';
import { WaveArt } from '@/ui/WaveArt';
import { Btn, Screen, T } from '@/ui/kit';
import { toast } from '@/ui/overlay';

/* Две стеклянные рамки из знака: медленно покачиваются навстречу друг другу */
function Mark(){return <View style={{height:230,width:'100%',maxWidth:420,borderRadius:36,overflow:'hidden',alignSelf:'center',marginVertical:26,backgroundColor:'#24152e'}}><WaveArt animate/></View>;}

/* после входа сначала забираем библиотеку с сервера: на новом телефоне сразу вернутся любимые и настройки */
export const afterLogin = () => finishLogin();

export default function Welcome() {
  const {colors:C}=useTheme();
  const { wait, error } = useAuthWait();
  const session = useSession();
  const signedIn = useLibrary((s) => !!s.account.token);
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
      <T v="xl" accessibilityRole="header">{'Твой ритм.\nТвоя волна.'}</T>
      <View style={{ flex: 1, minHeight: 28 }} />
      {signedIn && (session.loading || session.error) ? (
        <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 26, backgroundColor: C.s1 }}>
            {session.loading ? <ActivityIndicator color={C.tx} /> : null}
            <View style={{ flex: 1 }}>
              <T>{session.loading ? 'Загружаем твою библиотеку' : 'Не получилось загрузить библиотеку'}</T>
              <T v="small" style={{ marginTop: 2 }}>{session.loading ? 'Любимые треки, плейлисты и исполнители' : 'Проверь интернет и попробуй ещё раз'}</T>
            </View>
          </View>
          {session.error ? <Btn label="Повторить" icon="refresh" onPress={() => finishLogin()} /> : null}
          {session.error ? <Pressable onPress={() => { useSession.setState({ error: false }); useLibrary.getState().setAccount({ provider: null, token: undefined, userId: undefined, youtube: null }); }} accessibilityRole="button" style={{ alignSelf: 'center', padding: 12 }}><T v="sub">Войти в другой аккаунт</T></Pressable> : null}
        </View>
      ) : wait ? (
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
