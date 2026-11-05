import { Redirect } from 'expo-router';

import { useLibrary } from '@/store/library';

export default function Index() {
  const onboarded = useLibrary((s) => s.onboarded);
  const signedIn = useLibrary((s) => !!s.account.token);
  /* сначала вход, потом выбор исполнителей, потом приложение */
  return <Redirect href={!signedIn ? '/welcome' : !onboarded ? '/onboarding' : '/listen'} />;
}
