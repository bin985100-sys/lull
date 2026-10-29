import { build } from 'esbuild';
import assert from 'node:assert/strict';
let settings = { quality: 'auto' };
let requests = [];
let reply;
globalThis.__brokerTest = {
  settings: () => settings,
  fetch: async (url, init) => { requests.push({ url, init }); return reply; }
};
await build({ entryPoints: ['electron/audio-broker.ts'], outfile: 'work/desktop-broker.mjs', bundle: true, format: 'esm', platform: 'node', plugins: [{ name: 'broker-network-boundary', setup(b) {
  b.onResolve({ filter: /^(electron|\.\/store)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path === 'electron' ? 'export const net={fetch:(...a)=>globalThis.__brokerTest.fetch(...a)}' : 'export const mainSettings=()=>globalThis.__brokerTest.settings()' }));
} }] });
const { prepareBroker, brokerResponse } = await import('../work/desktop-broker.mjs');
reply = Response.json({ id: 'abcdefghijk', mime: 'audio/mp4', contentLength: 500, durationSec: 240, bitrate: 0, loudnessDb: 0 });
const audio = await prepareBroker('abcdefghijk', { title: 'Title', artist: 'Artist', duration: 240 });
assert.equal(audio.kind, 'broker');
assert.equal(new URL(requests[0].url).searchParams.get('d'), '240');
assert.equal(new URL(requests[0].url).searchParams.get('q'), 'aac');
reply = new Response('range bytes', { status: 206, headers: { 'Content-Type': 'audio/mp4', 'Content-Range': 'bytes 20-30/500', 'Accept-Ranges': 'bytes' } });
const forwarded = await brokerResponse(audio, 'bytes=20-30');
assert.equal(requests[1].init.headers.Range, 'bytes=20-30');
assert.equal(forwarded.headers.get('Content-Range'), 'bytes 20-30/500');
assert.equal(await forwarded.text(), 'range bytes');
settings = { relayOn: false };
await assert.rejects(prepareBroker('abcdefghijk'), /disabled/);
assert.equal(requests.length, 2, 'Disabled server must not make broker requests');
settings = {};
reply = Response.json({ id: 'wrong', mime: 'audio/mp4', contentLength: 500 });
await assert.rejects(prepareBroker('abcdefghijk'), /Invalid/);
console.log('Desktop broker: shared prepared source, AAC selection, metadata validation and unchanged Range/body forwarding passed');
