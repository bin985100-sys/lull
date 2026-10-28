import { create } from 'zustand';
import { cloud } from './client';
import { api } from '../api';
import { useLibrary } from '../store/library';
import { flushAccount } from './sync';
import type { Track } from '../../shared/types';

interface Video {
  id: string;
  snippet?: { title?: string; categoryId?: string; channelTitle?: string; thumbnails?: Record<string, { url: string }> };
  contentDetails?: { duration?: string };
}
export const useYoutubeImport = create<{ busy: boolean; message: string }>(() => ({ busy: false, message: '' }));
export function musicTrack(video: Video): Track | null {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(video.id) || video.snippet?.categoryId !== '10' || !video.snippet.title) return null;
  const duration = video.contentDetails?.duration?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  return { id: video.id, title: video.snippet.title, artists: [{ name: (video.snippet.channelTitle ?? '').replace(/ - Topic$/, '') }],
    thumb: video.snippet.thumbnails?.high?.url ?? video.snippet.thumbnails?.default?.url,
    durationSec: duration ? Number(duration[1] ?? 0) * 3600 + Number(duration[2] ?? 0) * 60 + Number(duration[3] ?? 0) : undefined };
}

let running: Promise<void> | undefined;
export function importYoutube(once = true): Promise<void> {
  return running ??= performImport(once).finally(() => { running = undefined; });
}
async function performImport(once: boolean) {
  if (!cloud) return;
  useYoutubeImport.setState({ busy: true, message: 'Переносим музыку из YouTube…' });
  try {
    const { data: { session }, error } = await cloud.auth.getSession();
    if (error) throw error;
    if (!session) throw new Error('Сначала войди в Google');
    const profile = await cloud.from('lull_profiles').select('youtube_imported_at').eq('user_id', session.user.id).maybeSingle();
    if (profile.error) throw profile.error;
    if (once && profile.data?.youtube_imported_at) { useYoutubeImport.setState({ message: 'Музыка YouTube уже перенесена' }); return; }
    const token = session.provider_token;
    if (!token) throw new Error('Чтобы перенести музыку YouTube, войди через Google ещё раз и разреши доступ к YouTube');
    async function request<T>(resource: string, params: Record<string, string>): Promise<{ items: T[]; nextPageToken?: string }> {
      const result = await fetch(`https://www.googleapis.com/youtube/v3/${resource}?${new URLSearchParams(params)}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12_000)
      });
      if (result.status === 401) throw new Error('Доступ Google истёк. Войди снова, чтобы перенести музыку');
      if (result.status === 403) throw new Error('Google не разрешил чтение YouTube. Проверь согласие на доступ и включение YouTube Data API в проекте Google');
      if (!result.ok) throw new Error(`YouTube временно недоступен (${result.status})`);
      return result.json();
    }
    async function pages<T>(resource: string, params: Record<string, string>): Promise<T[]> {
      const items: T[] = []; let next = ''; const seen = new Set<string>();
      do {
        if (seen.has(next)) throw new Error('YouTube повторил страницу. Попробуй ещё раз');
        seen.add(next);
        const page = await request<T>(resource, { ...params, maxResults: '50', ...(next ? { pageToken: next } : {}) });
        items.push(...page.items); next = page.nextPageToken ?? '';
      } while (next);
      return items;
    }
    const liked = (await pages<Video>('videos', { part: 'snippet,contentDetails', myRating: 'like' })).map(musicTrack).filter((v): v is Track => !!v);
    const lists = await pages<{ id: string; snippet: { title: string; description?: string } }>('playlists', { part: 'snippet', mine: 'true' });
    const imported: { id: string; name: string; description?: string; tracks: Track[] }[] = [];
    for (const list of lists) {
      const items = await pages<{ contentDetails: { videoId: string } }>('playlistItems', { part: 'contentDetails', playlistId: list.id });
      const ids = items.map(v => v.contentDetails?.videoId).filter(Boolean);
      const tracks = new Map<string, Track>();
      for (let i = 0; i < ids.length; i += 50) {
        const page = await request<Video>('videos', { part: 'snippet,contentDetails', id: ids.slice(i, i + 50).join(',') });
        for (const video of page.items) { const track = musicTrack(video); if (track) tracks.set(track.id, track); }
      }
      const music = [...new Set(ids)].map(id => tracks.get(id)).filter((v): v is Track => !!v);
      if (music.length) imported.push({ id: `youtube:${list.id}`, name: list.snippet.title, description: list.snippet.description, tracks: music });
    }
    // Read the current library after the network work so edits made while the
    // import was running are retained. Import adds music; it never deletes it.
    const current = useLibrary.getState(); const now = Date.now();
    const likes = [...current.likes, ...liked.filter(t => !current.likes.some(v => v.track.id === t.id)).map(track => ({ track, addedAt: now }))];
    const playlists = [...current.playlists];
    for (const list of imported) {
      const old = playlists.find(v => v.id === list.id);
      if (old) { const have = new Set(old.tracks.map(v => v.track.id)); playlists[playlists.indexOf(old)] = { ...old, tracks: [...old.tracks, ...list.tracks.filter(t => !have.has(t.id)).map(track => ({ track, addedAt: now }))] }; }
      else playlists.push({ ...list, tracks: list.tracks.map(track => ({ track, addedAt: now })), createdAt: now });
    }
    const data = { likes, playlists, history: current.history, saved: current.saved, stats: current.stats };
    useLibrary.setState(data); await api.storeSet('library', data); await flushAccount();
    const mark = await cloud.from('lull_profiles').upsert({ user_id: session.user.id, youtube_imported_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (mark.error) throw mark.error;
    useYoutubeImport.setState({ message: `Перенесено: ${liked.length} понравившихся музыкальных видео и ${imported.length} плейлистов` });
  } catch (error) {
    useYoutubeImport.setState({ message: error instanceof Error ? error.message : 'Не удалось перенести музыку YouTube' });
  } finally { useYoutubeImport.setState({ busy: false }); }
}
