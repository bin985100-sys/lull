import type { LibraryData, LocalPlaylist, MonthStats } from '../store/library';

export interface Entry { collection: string; item_id: string; value: unknown; deleted: boolean }
export const entryKey = (e: Pick<Entry, 'collection' | 'item_id'>) => JSON.stringify([e.collection, e.item_id]);
export const emptyLibrary = (): LibraryData => ({ likes: [], playlists: [], saved: [], history: [], stats: {} });

export function flatten(data: LibraryData): Map<string, Entry> {
  const rows = new Map<string, Entry>();
  const put = (collection: string, item_id: string, value: unknown) => {
    const row = { collection, item_id, value, deleted: false }; rows.set(entryKey(row), row);
  };
  for (const v of data.likes) put('likes', v.track.id, v);
  for (const { tracks, ...v } of data.playlists) {
    put('playlists', v.id, v);
    tracks.forEach((t, order) => put('playlist_tracks', JSON.stringify([v.id, t.track.id]), { ...t, playlist_id: v.id, order }));
  }
  for (const v of data.saved) put('saved', v.card.id, v);
  for (const v of data.history) put('history', v.track.id, v);
  return rows;
}

/** Only changes observed locally become writes. Unseen remote additions survive. */
export function diff(before: Map<string, Entry>, after: Map<string, Entry>): Entry[] {
  const changed: Entry[] = [];
  for (const [key, row] of after) if (JSON.stringify(before.get(key)) !== JSON.stringify(row)) changed.push(row);
  for (const [key, row] of before) if (!after.has(key) && !row.deleted) changed.push({ ...row, deleted: true });
  return changed;
}

export function expand(rows: Iterable<Entry>): LibraryData {
  const data = emptyLibrary();
  const playlists = new Map<string, LocalPlaylist>();
  const tracks: { track: LibraryData['likes'][number]['track']; addedAt: number; playlist_id: string; order: number }[] = [];
  for (const row of rows) {
    if (row.deleted || !row.value || typeof row.value !== 'object') continue;
    switch (row.collection) {
      case 'likes': { const v = row.value as LibraryData['likes'][number]; if (v.track?.id) data.likes.push(v); break; }
      case 'saved': { const v = row.value as LibraryData['saved'][number]; if (v.card?.id) data.saved.push(v); break; }
      case 'history': { const v = row.value as LibraryData['history'][number]; if (v.track?.id) data.history.push(v); break; }
      case 'playlists': { const v = row.value as LocalPlaylist; if (v.id && v.name) playlists.set(v.id, { ...v, tracks: [] }); break; }
      case 'playlist_tracks': tracks.push(row.value as typeof tracks[number]); break;
      case 'stats': {
        const { month, stats } = row.value as { month: string; stats: MonthStats };
        if (month && stats) data.stats[month] = addStats(data.stats[month], stats);
      }
    }
  }
  tracks.sort((a, b) => a.order - b.order).forEach((v) => {
    if (v.track?.id) playlists.get(v.playlist_id)?.tracks.push({ track: v.track, addedAt: v.addedAt });
  });
  data.playlists = [...playlists.values()].sort((a, b) => b.createdAt - a.createdAt);
  data.likes.sort((a, b) => b.addedAt - a.addedAt);
  data.saved.sort((a, b) => b.at - a.at);
  data.history.sort((a, b) => b.at - a.at); data.history = data.history.slice(0, 200);
  return data;
}

export function addStats(a: MonthStats | undefined, b: MonthStats): MonthStats {
  const out: MonthStats = structuredClone(a ?? { sec: 0, plays: {}, days: {} });
  out.sec += b.sec;
  for (const [id, v] of Object.entries(b.plays)) {
    const old = out.plays[id]; out.plays[id] = { track: v.track, count: (old?.count ?? 0) + v.count, sec: (old?.sec ?? 0) + v.sec };
  }
  for (const [day, sec] of Object.entries(b.days)) out.days[day] = (out.days[day] ?? 0) + sec;
  return out;
}

export function statsDelta(before: MonthStats | undefined, after: MonthStats): MonthStats {
  const out: MonthStats = { sec: Math.max(0, after.sec - (before?.sec ?? 0)), plays: {}, days: {} };
  for (const [id, v] of Object.entries(after.plays)) {
    const old = before?.plays[id]; const count = Math.max(0, v.count - (old?.count ?? 0)); const sec = Math.max(0, v.sec - (old?.sec ?? 0));
    if (count || sec) out.plays[id] = { track: v.track, count, sec };
  }
  for (const [day, sec] of Object.entries(after.days)) if (sec > (before?.days[day] ?? 0)) out.days[day] = sec - (before?.days[day] ?? 0);
  return out;
}
