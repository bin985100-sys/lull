import { Redirect } from 'expo-router';

import { useLibrary } from '@/store/library';

export default function Index() {
  const onboarded = useLibrary((s) => s.onboarded);
  return <Redirect href={onboarded ? '/listen' : '/welcome'} />;
}
