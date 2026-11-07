import { LULL_API } from './lull';
import { player, usePlayer, useProgress } from '@/player/player';
import { useLibrary } from '@/store/library';
export async function transferPlayback(send: boolean) {
  const token = useLibrary.getState().account.token;
  if (!token) throw Error('Войди в тот же аккаунт Lull на обоих устройствах');
  const state = usePlayer.getState();
  if (send && !state.queue[state.index]) throw Error('Сначала включи трек');
  const body = send ? {token,op:'put',data:{queue:state.queue,index:state.index,position:useProgress.getState().time}} : {token};
  const res = await fetch(LULL_API+'/api/auth/playback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data = await res.json();
  if (!res.ok) throw Error(data?.error || 'Ошибка передачи');
  if (token !== useLibrary.getState().account.token) return;
  if (!send) {
    if (!data?.queue?.[data.index]) throw Error('На первом устройстве нажми «Передать очередь»');
    await player.resume(data.queue,data.index,data.position);
  } else if (usePlayer.getState().playing && usePlayer.getState().queue === state.queue) player.toggle();
}
