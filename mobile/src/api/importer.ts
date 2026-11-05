/* Перенос музыки по ссылке из других сервисов: сервер Lull читает список и находит треки в каталоге. */
import type { Track } from './audius';
import { LULL_API, mapTrack } from './lull';

export const SERVICES = ['Spotify', 'Apple Music', 'YouTube Music', 'SoundCloud', 'Яндекс Музыка', 'Deezer'] as const;

export type ImportState = {
  status: 'reading' | 'matching' | 'done' | 'error';
  service: string; name: string; done: number; total: number; matched: number; declared?: number; error?: string;
  tracks?: Track[]; missing?: string[]; artists?: { id: string; name: string; count: number }[];
};

async function req(path: string, init?: RequestInit) {
  const r = await fetch(`${LULL_API}/api/import${path}`, init).catch(() => { throw new Error('Нет связи с сервером Lull'); });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Сервер ответил ${r.status}`);
  return j;
}

/* Запускает перенос и сообщает о ходе каждые ~0,8 с; возвращает функцию отмены */
export function runImport(url: string, onState: (s: ImportState) => void, onError: (e: Error) => void) {
  let stop = false;
  (async () => {
    try {
      const { id, service } = await req('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      onState({ status: 'reading', service, name: '', done: 0, total: 0, matched: 0 });
      while (!stop) {
        await new Promise((r) => setTimeout(r, 800));
        const s = await req(`/${encodeURIComponent(id)}`);
        if (stop) return;
        if (s.status === 'error') throw new Error(s.error || 'Не получилось перенести');
        onState({ ...s, tracks: s.tracks?.map((t: any) => mapTrack(t)) });
        if (s.status === 'done') return;
      }
    } catch (e) { if (!stop) onError(e as Error); }
  })();
  return () => { stop = true; };
}
