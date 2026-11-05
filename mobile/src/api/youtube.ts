/* YouTube Music пользователя: подключение аккаунта Google (только чтение) и перенос лайков и плейлистов в Lull. */
import { useLibrary } from '@/store/library';
import { openAuthUrl, useAuthWait } from './auth';
import { LULL_API, mapTrack } from './lull';
import type { Track } from './audius';

export type YtPlaylist = { id: string; title: string; count: number; thumb?: string };

async function call<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = useLibrary.getState().account.token;
  if (!token) throw new Error('Сначала войди в Lull через Google или Telegram');
  const r = await fetch(`${LULL_API}/api/auth/yt/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...body }) }).catch(() => {
    throw new Error('Нет связи с сервером Lull');
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 409) useLibrary.getState().setAccount({ youtube: null });
  if (!r.ok) throw new Error(j.error || `Сервер ответил ${r.status}`);
  return j as T;
}

let timer: ReturnType<typeof setInterval> | null = null;
export async function linkYouTube(done: () => void) {
  const { nonce, url } = await call<{ nonce: string; url: string }>('start');
  useAuthWait.setState({ error: null });
  if (timer) clearInterval(timer);
  const started = Date.now();
  timer = setInterval(async () => {
    if (Date.now() - started > 10 * 60e3) { clearInterval(timer!); timer = null; return; }
    try {
      const r = await fetch(`${LULL_API}/api/auth/poll?nonce=${encodeURIComponent(nonce)}`).then((x) => x.json());
      if (r.status === 'pending') return;
      clearInterval(timer!); timer = null;
      if (r.status === 'ok') { useLibrary.getState().setAccount({ youtube: r.user?.youtube?.name || 'Google' }); done(); }
    } catch {}
  }, 1500);
  await openAuthUrl(url, 'google');
}

export const unlinkYouTube = () => call('unlink').finally(() => useLibrary.getState().setAccount({ youtube: null }));

export async function ytLibrary() {
  const r = await call<{ account: string; liked: any[]; playlists: YtPlaylist[] }>('library');
  return { account: r.account, liked: r.liked.map((t) => mapTrack(t)) as Track[], playlists: r.playlists };
}
export const ytPlaylist = (id: string) => call<any[]>('playlist', { id }).then((l) => l.map((t) => mapTrack(t)) as Track[]);
