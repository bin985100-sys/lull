import type { SearchResults, Track } from '../shared/types';

const normalize = (s: string) => s.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Public catalog metadata only; never account history or listening activity. */
export class SearchPrefixes {
  private tracks = new Map<string, Track>();
  constructor(saved: Track[] = []) { this.learn(saved); }
  learn(tracks: Track[]) {
    for (const track of tracks) {
      if (!/^[\w-]{11}$/.test(track.id) || !track.title || !track.artists?.length) continue;
      this.tracks.delete(track.id);
      this.tracks.set(track.id, track);
    }
    while (this.tracks.size > 3000) this.tracks.delete(this.tracks.keys().next().value!);
  }
  snapshot() { return [...this.tracks.values()]; }
  complete(query: string, result: SearchResults): Track[] {
    const q = normalize(query);
    if (q.length < 2 || q.length > 60) return [];
    const present = new Set(result.tracks.map(t => t.id));
    return [...this.tracks.values()].filter(t => {
      const name = normalize(t.title);
      return !present.has(t.id) && name !== q && name.startsWith(q) && name.length <= q.length + 24;
    }).sort((a, b) => normalize(a.title).length - normalize(b.title).length).slice(0, 4);
  }
}
