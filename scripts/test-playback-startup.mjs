import assert from 'node:assert/strict';
import { firstPlayable } from '../electron/stream-selection.ts';
import { lyricsPlayback, syncLyricsClock } from '../src/lib/lyricsClock.ts';
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

// A stalled primary must not block a matching fallback.
let completePrimary;
const delayed = new Promise((resolve) => { completePrimary = resolve; });
assert.equal(await firstPlayable(delayed, async () => 'matching-local-audio', 5), 'matching-local-audio');
completePrimary('late-primary');
let unnecessary = false;
assert.equal(await firstPlayable(Promise.resolve('ready'), async () => { unnecessary = true; return 'alternate'; }, 5), 'ready');
await new Promise((resolve) => setTimeout(resolve, 15));
assert.equal(unnecessary, false);
assert.equal(await firstPlayable(Promise.reject(new Error('blocked')), async () => 'fallback', 1000), 'fallback');
let finishRemote;
const remaining = new Promise((resolve) => { finishRemote = resolve; });
const unmatched = firstPlayable(remaining, async () => null, 1);
setTimeout(() => finishRemote('original-recording'), 10);
assert.equal(await unmatched, 'original-recording');

// While buffering, play intent is not a running lyric clock, even if the old
// audio element still reports the previous track's position.
const waiting = lyricsPlayback({ playing: true, loading: true, position: 0 }, { isPlaying: false, position: 99 });
assert.deepEqual(waiting, { playing: false, time: 0 });
let writes = 0;
let active = false;
let position = 0;
const element = { get playing() { return active; }, set playing(value) { active = value; writes++; },
  get currentTime() { return position; }, set currentTime(value) { position = value; writes++; } };
for (let i = 0; i < 120; i++) syncLyricsClock(element, waiting.time, waiting.playing);
assert.equal(writes, 0, 'Buffering must not restart lyric rendering every frame');
const running = lyricsPlayback({ playing: true, loading: false, position: 0 }, { isPlaying: true, position: 1.25 });
syncLyricsClock(element, running.time, running.playing);
assert.equal(active, true);
assert.equal(position, 1.25);
assert.equal(writes, 2);

// Exercise the actual shared preparation service with isolated sources.
fs.mkdirSync('work', { recursive: true });
const fixture = path.resolve('work/qa-audio.tmp');
fs.writeFileSync(fixture, 'fixture');
let resolveRemote;
let local = null;
let resolutions = 0;
globalThis.__lullPlaybackTest = {
  localFileFor: () => undefined,
  scFileFor: () => local,
  soundcloudFallback: async () => { local = { file: fixture, size: 7, mime: 'audio/mpeg' }; return local; },
  prepareSoundcloud: async () => null,
  hintFor: () => ({ title: 'Example', artist: 'Example', duration: 120 }),
  fetchRange: async () => new Response('audio', { status: 206, headers: { 'content-type': 'audio/webm' } }),
  invalidateStream: () => {}, noteForbidden: () => {},
  withTimeout: (promise) => promise,
  resolveStream: () => { resolutions++; return new Promise((resolve) => { resolveRemote = resolve; }); }
};
try {
  await build({ entryPoints: ['electron/playback.ts'], outfile: 'work/playback-test.mjs', bundle: true, platform: 'node', format: 'esm',
    plugins: [{ name: 'isolated-audio-sources', setup(builder) {
      builder.onResolve({ filter: /^\.\/(downloads|soundcloud|yt)$/ }, (args) => ({ path: args.path, namespace: 'audio-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'audio-test' }, (args) => {
        const names = args.path === './downloads' ? ['localFileFor'] : args.path === './soundcloud' ? ['scFileFor', 'soundcloudFallback', 'prepareSoundcloud'] : ['hintFor', 'resolveStream', 'fetchRange', 'invalidateStream', 'noteForbidden', 'withTimeout'];
        return { contents: names.map((name) => `export const ${name} = (...args) => globalThis.__lullPlaybackTest.${name}(...args);`).join('\n'), loader: 'js' };
      });
    } }] });
  const { preparePlayback, playbackMeta } = await import('../work/playback-test.mjs');
  const a = preparePlayback('test-track');
  assert.equal(preparePlayback('test-track'), a, 'IPC and media request must share preparation');
  const chosen = await a;
  assert.equal(chosen.kind, 'local');
  assert.equal(playbackMeta('test-track', chosen).durationSec, 120);
  resolveRemote({ id: 'test-track', expiresAt: Date.now() + 60000 });
  await Promise.resolve();
  assert.equal(await preparePlayback('test-track'), chosen, 'Late remote audio must not replace the chosen local file');
  assert.equal(resolutions, 1, 'Metadata lookup must not restart remote preparation');

  // Cached metadata is not proof the stream is playable. A 403 must allow the
  // local match to win instead of starting media-decoder retry loops.
  local = null;
  let invalidations = 0;
  let forbidden = 0;
  let checks = 0;
  globalThis.__lullPlaybackTest.resolveStream = async () => ({ id: 'blocked', contentLength: 1000, expiresAt: Date.now() + 60000 });
  globalThis.__lullPlaybackTest.fetchRange = async () => { checks++; return new Response(null, { status: 403 }); };
  globalThis.__lullPlaybackTest.invalidateStream = () => { invalidations++; };
  globalThis.__lullPlaybackTest.noteForbidden = () => { forbidden++; };
  assert.equal((await preparePlayback('blocked')).kind, 'local');
  assert.ok(checks >= 1 && invalidations >= 1 && forbidden >= 1, 'Rejected cached audio must be validated and invalidated');
  local = null;
  globalThis.__lullPlaybackTest.prepareSoundcloud = async () => ({ url: 'https://soundcloud.com/example', size: 4000000, mime: 'audio/mpeg', durationSec: 120 });
  globalThis.__lullPlaybackTest.soundcloudFallback = async () => { throw new Error('Full audio download must not block streaming startup'); };
  assert.equal((await preparePlayback('progressive')).kind, 'soundcloud');
} finally {
  fs.rmSync(fixture, { force: true });
  delete globalThis.__lullPlaybackTest;
}
console.log('PASS: fallback starts during primary wait, one source is retained, and lyrics stay frozen until audio plays.');
