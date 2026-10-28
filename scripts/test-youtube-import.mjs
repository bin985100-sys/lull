import { build } from 'esbuild';
import assert from 'node:assert/strict';
let state = { likes: [], playlists: [], saved: [], history: [], stats: {} };
let marker = null, flushed = false, calls = 0, provider = 'google';
const video = (id, categoryId = '10') => ({ id, snippet: { title: id, categoryId, channelTitle: 'Artist - Topic' }, contentDetails: { duration: 'PT1H2M3S' } });
globalThis.__importTest = {
  cloud: { auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' }, provider_token: 'fixture' } } }) }, from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { youtube_imported_at: marker } }) }) }),
    upsert: async row => { assert.equal(flushed, true); marker = row.youtube_imported_at; return {}; }
  }) },
  library: { getState: () => state, setState: data => { state = data; } },
  api: { storeSet: async (_key, data) => { assert.deepEqual(data, state); } },
  flush: async () => { flushed = true; }
};
globalThis.fetch = async (raw, options) => {
  assert.equal(options.headers.Authorization, 'Bearer fixture'); calls++;
  const url = new URL(raw), resource = url.pathname.split('/').at(-1);
  if (resource === 'playlists') return Response.json({ items: [{ id: 'private-list', snippet: { title: 'Music' } }] });
  if (resource === 'playlistItems') return Response.json({ items: ['music000001','speech00001','music000001'].map(videoId => ({ contentDetails: { videoId } })) });
  if (url.searchParams.has('myRating')) {
    if (!url.searchParams.has('pageToken')) return Response.json({ items: [video('liked000001'),video('speech00001','22')], nextPageToken: 'page2' });
    return Response.json({ items: [video('liked000002')] });
  }
  // An edit made while network requests are running must not be overwritten.
  state.likes.push({ track: { id: 'local000001', title: 'Local', artists: [] }, addedAt: 1 });
  return Response.json({ items: [video('music000001'), video('speech00001','22')] });
};
await build({ entryPoints: ['src/account/youtube.ts'], outfile: 'work/youtube-import.mjs', bundle: true, format: 'esm', platform: 'node', plugins: [{ name: 'google-boundaries', setup(b) {
  b.onResolve({ filter: /^(\.\/google|\.\/client|\.\.\/api|\.\/sync|\.\.\/store\/library)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path === './google' ? `export const useGoogleConnection={getState:()=>({error:''})};export const ensureGoogleConnection=async()=>globalThis.__importTest.provider()==='google'||globalThis.__importTest.connected;export const requestYoutube=async(resource,params)=>(await fetch('https://www.googleapis.com/youtube/v3/'+resource+'?'+new URLSearchParams(params),{headers:{Authorization:'Bearer fixture'}})).json()` : a.path === './client' ? 'export const cloud=globalThis.__importTest.cloud' : a.path === './sync' ? 'export const flushAccount=globalThis.__importTest.flush' : a.path === '../api' ? 'export const api=globalThis.__importTest.api' : 'export const useLibrary=globalThis.__importTest.library' }));
} }] });
const { importYoutube, musicTrack } = await import('../work/youtube-import.mjs');
globalThis.__importTest.provider = () => provider;
assert.equal(musicTrack(video('music000001')).durationSec, 3723);
assert.equal(musicTrack(video('speech00001', '22')), null);
await importYoutube();
assert.deepEqual(state.likes.map(v => v.track.id), ['local000001','liked000001','liked000002']);
assert.deepEqual(state.playlists[0].tracks.map(v => v.track.id), ['music000001']);
assert.ok(marker);
const before = calls; await importYoutube(); assert.equal(calls, before, 'A successful first import is not repeated on every device launch');
provider = 'discord'; await importYoutube(false); assert.equal(calls, before, 'A Discord token must never be sent to YouTube');
globalThis.__importTest.connected=true;await importYoutube(false);assert.ok(calls>before,'An existing server-side Google connection survives switching Lull login provider');
console.log('YouTube import: pagination, music filtering, duplicate removal, concurrent edits and one-time marker passed; real OAuth not tested');
