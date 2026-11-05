import { resetTo } from '@/nav';
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { checkNow, useAuthWait } from '@/api/auth';
import { finishLogin } from '@/api/session';
import { useLibrary } from '@/store/library';
import { C } from '@/theme/tokens';
import { Spinner } from '@/ui/kit';

/* Сюда возвращает кнопка «Вернуться в Lull» из бота или со страницы Google (lull://auth) */
export default function AuthReturn() {
  const { nonce } = useLocalSearchParams<{ nonce?: string }>();
  useEffect(() => {
    let n = 0;
    const tick = async () => {
      await checkNow(nonce);
      const acc = useLibrary.getState().account;
      if (acc.token) { await finishLogin(); return true; }
      if ((!nonce && !useAuthWait.getState().wait) || ++n > 20) { resetTo('/welcome'); return true; }
      return false;
    };
    const t = setInterval(async () => { if (await tick()) clearInterval(t); }, 700);
    tick();
    return () => clearInterval(t);
  }, [nonce]);
  return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><Spinner /></View>;
}
