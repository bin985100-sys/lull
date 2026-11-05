import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { finishLogin } from '@/api/session';
import { useLibrary } from '@/store/library';
import { C } from '@/theme/tokens';
import { Spinner } from '@/ui/kit';

export default function Index() {
  const onboarded = useLibrary((s) => s.onboarded);
  const signedIn = useLibrary((s) => !!s.account.token);
  const pending = signedIn && !onboarded;
  /* вошёл, но артисты не выбраны: сначала сверяемся с сервером — может, библиотека уже есть и выбирать заново не нужно */
  useEffect(() => { if (pending) finishLogin(); }, [pending]);
  if (pending) return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><Spinner /></View>;
  /* сначала вход, потом выбор исполнителей, потом приложение */
  return <Redirect href={!signedIn ? '/welcome' : '/listen'} />;
}
