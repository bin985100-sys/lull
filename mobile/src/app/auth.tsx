import { resetTo } from '@/nav';
import { useEffect } from 'react';
import { View } from 'react-native';

import { checkNow, useAuthWait } from '@/api/auth';
import { useLibrary } from '@/store/library';
import { C } from '@/theme/tokens';
import { Spinner } from '@/ui/kit';

/* Сюда возвращает кнопка «Вернуться в Lull» из бота или со страницы Google (lull://auth) */
export default function AuthReturn() {
  useEffect(() => {
    let n = 0;
    const tick = async () => {
      await checkNow();
      const acc = useLibrary.getState().account;
      if (acc.token) { resetTo(useLibrary.getState().onboarded ? '/listen' : '/onboarding'); return true; }
      if (!useAuthWait.getState().wait || ++n > 8) { resetTo('/welcome'); return true; }
      return false;
    };
    const t = setInterval(async () => { if (await tick()) clearInterval(t); }, 700);
    tick();
    return () => clearInterval(t);
  }, []);
  return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><Spinner /></View>;
}
