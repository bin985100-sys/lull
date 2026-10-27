import { build } from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs';

fs.mkdirSync('work', { recursive: true });
globalThis.window = { Capacitor: { isNativePlatform: () => true } };
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
globalThis.__pluginCalls = [];
await build({ entryPoints: ['src/lib/mediaSession.ts'], outfile: 'work/native-media-test.mjs', bundle: true, format: 'esm', platform: 'browser',
  plugins: [{ name: 'capacitor-proxy', setup(builder) {
    builder.onResolve({ filter: /^@jofr\/capacitor-media-session$/ }, () => ({ path: 'mock', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `export const MediaSession = new Proxy({}, { get(_target, method) { return async (...args) => { globalThis.__pluginCalls.push({ method, args }); }; } });` }));
  } }] });
const media = await import('../work/native-media-test.mjs?' + Date.now());
media.setPlaying(true);
media.setMeta({ title: 'Test', artist: 'Artist', album: '', artwork: undefined });
media.setPosition(2, 120);
media.onAction('pause', () => {});
await new Promise(resolve => setTimeout(resolve, 30));
assert.deepEqual(globalThis.__pluginCalls.map(call => call.method).sort(), ['setActionHandler', 'setMetadata', 'setPlaybackState', 'setPositionState']);
console.log('PASS: native media controls are called without treating the Capacitor plugin as a Promise');
