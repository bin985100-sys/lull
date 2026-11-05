import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { player } from '@/player/player';
import { useLibrary } from '@/store/library';
import { C } from '@/theme/tokens';
import { T } from '@/ui/kit';

/* Служебный вход для автопроверки сборки: lull://debug?play=<id> или lull://debug?artist=<id> */
export default function Debug() {
  const { play, artist } = useLocalSearchParams<{ play?: string; artist?: string }>();
  useEffect(() => {
    useLibrary.getState().setOnboarded(true);
    if (play) {
      player.play([{ id: play, title: 'Проверка', artist: 'Lull', artistId: '', duration: 0, streamable: true, source: 'yt' }], play);
      router.replace('/listen');
    } else if (artist) router.replace({ pathname: '/artist/[id]', params: { id: artist, s: 'yt' } });
  }, [play, artist]);
  return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><T>debug</T></View>;
}
