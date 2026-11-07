import { useEffect } from 'react';
import { Screen, T, TopBar } from '@/ui/kit';
import { TrackRow } from '@/components/TrackRow';
import { loadDownloads, useDownloads } from '@/player/downloads';

export default function Downloads() {
  const tracks = useDownloads(s => s.tracks);
  useEffect(() => { loadDownloads(); }, []);
  return <Screen><TopBar/><T v="h1">Скачанная музыка</T>
    {tracks.length === 0 && <T v="sub">Выбери «Скачать» в меню трека или плейлиста.</T>}
    {tracks.map(t => <TrackRow key={(t.source || 'audius') + t.id} track={t} list={tracks} sub noWarm/>)}
  </Screen>;
}
