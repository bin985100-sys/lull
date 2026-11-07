import { Pressable, View } from 'react-native';
import { T } from '@/ui/kit';
import { closeSheet, openSheet, toast } from '@/ui/overlay';
import { setSleep, useSleep } from '@/player/player';
import { downloaded, saveDownload } from '@/player/downloads';
import { streamUrl, type Track } from '@/api/audius';
import { streamUrlYt } from '@/api/lull';

export async function saveTracks(tracks: Track[]) {
  let ok = 0;
  toast('Скачивание началось', 'download');
  for (const t of tracks) {
    try { if (!downloaded(t)) await saveDownload(t,t.source === 'yt' ? streamUrlYt(t.id) : streamUrl(t.id)); ok++; } catch {}
  }
  toast(`Скачано ${ok} из ${tracks.length}`, ok === tracks.length ? 'check' : 'info');
}
export function SleepButton() {
  const state = useSleep();
  const label = state.endTrack ? 'До конца трека' : state.deadline ? 'До ' + new Date(state.deadline).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : 'Таймер сна';
  return <Pressable accessibilityRole="button" onPress={() => openSheet(() => <View><T v="h2">Таймер сна</T>
    {([15,30,45,'track',null] as const).map(m => <Pressable key={String(m)} style={{paddingVertical:14}} onPress={() => { setSleep(m); closeSheet(); }}>
      <T>{m === null ? 'Выключить' : m === 'track' ? 'До конца трека' : m + ' минут'}</T></Pressable>)}</View>)}
    style={{alignItems:'center',justifyContent:'center',padding:6}}><T>{label}</T></Pressable>;
}
