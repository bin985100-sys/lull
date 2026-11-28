import type { Track } from '@/api/audius';
import type { WaveMode } from '@/store/taste';

export const recordingKey = (track: Track) => `${track.source || 'audius'}:${track.id}`;
const artist = (track: Track) => track.artistId || `n:${track.artist.toLowerCase()}`;
export type RecoSource = 'radio' | 'artist' | 'favorite' | 'discovery' | 'mood' | 'charts';
export type Candidate = { track: Track; source: RecoSource; affinity?: number };
export type SelectionPolicy = {
  mode: WaveMode; length: number; balance: number; perArtist: number; personal: boolean;
  knownArtists: Set<string>; liked: Set<string>; hiddenTracks: Set<string>; hiddenArtists: Set<string>;
  skipped: Set<string>; lastPlayed: Map<string, number>; exclude: Set<string>; noRepeatHours: number;
  useSkips: boolean; now: number; random: () => number; allowRecent?: boolean;
};
const shares = [.95, .75, .5, .25, .05];
const weights: Record<WaveMode, Record<RecoSource, number>> = {
  sound: { radio: 4, artist: 3, favorite: 4, discovery: 4, mood: 2, charts: 1 },
  artist: { radio: 2, artist: 10, favorite: 5, discovery: 2, mood: 1, charts: 1 },
  discover: { radio: 4, artist: 1, favorite: 1, discovery: 10, mood: 3, charts: 3 },
  favorite: { radio: 2, artist: 5, favorite: 12, discovery: 1, mood: 1, charts: 1 },
  calm: { radio: 2, artist: 1, favorite: 2, discovery: 2, mood: 12, charts: 1 },
  energy: { radio: 2, artist: 1, favorite: 2, discovery: 2, mood: 12, charts: 1 },
};

/** One constrained selector for radio and the personal feed. Diversity is a
 * property of the resulting batch, rather than a shuffle of one artist's list. */
export function selectRecommendations(candidates: Candidate[], policy: SelectionPolicy): Track[] {
  const rows = new Map<string, { track: Track; known: boolean; score: number }>();
  for (const item of candidates) {
    const track = item.track;
    if (!track?.id || !track.streamable) continue;
    const key = recordingKey(track), artistId = artist(track);
    if (policy.exclude.has(key) || policy.hiddenTracks.has(track.id) || policy.hiddenArtists.has(artistId)) continue;
    if (policy.useSkips && policy.skipped.has(key)) continue;
    if (!policy.allowRecent && policy.noRepeatHours && policy.now - (policy.lastPlayed.get(key) || 0) < policy.noRepeatHours * 3600e3) continue;
    const known = policy.knownArtists.has(artistId) || policy.liked.has(key);
    const score = weights[policy.mode][item.source] + Math.min(2, Math.max(0, item.affinity || 0)) + (policy.liked.has(key) ? .7 : 0) + policy.random() * .8;
    if (!rows.has(key) || rows.get(key)!.score < score) rows.set(key, { track, known, score });
  }
  const pool = [...rows.values()], result: Track[] = [], counts = new Map<string, number>();
  const focusedArtist = !policy.personal && policy.mode === 'artist';
  let familiarShare = shares[Math.max(0, Math.min(4, policy.balance))];
  if (policy.mode === 'discover') familiarShare = Math.min(.15, familiarShare);
  if (policy.mode === 'favorite') familiarShare = Math.max(.85, familiarShare);
  const cap = focusedArtist ? policy.length : Math.max(2, Math.ceil(policy.length * (policy.personal ? .2 : .28)));
  let familiar = 0;
  while (result.length < policy.length && pool.length) {
    const tail = result.slice(-policy.perArtist).map(artist);
    const eligible = pool.filter(row => (counts.get(artist(row.track)) || 0) < cap && (focusedArtist || tail.length < policy.perArtist || tail.some(key => key !== artist(row.track))));
    if (!eligible.length) break;
    const wantKnown = familiar < (result.length + 1) * familiarShare;
    const preferred = eligible.filter(row => row.known === wantKnown);
    const choices = preferred.length ? preferred : eligible;
    const selected = choices.reduce((best, row) => row.score - (counts.get(artist(row.track)) || 0) * .55 > best.score - (counts.get(artist(best.track)) || 0) * .55 ? row : best);
    result.push(selected.track); familiar += Number(selected.known);
    counts.set(artist(selected.track), (counts.get(artist(selected.track)) || 0) + 1);
    pool.splice(pool.indexOf(selected), 1);
  }
  return result;
}
