import { build } from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs';

fs.mkdirSync('work', { recursive: true });
await build({ entryPoints: ['src/player/engine.ts'], outfile: 'work/engine-cancellation.mjs', bundle: true, format: 'esm', platform: 'browser' });
class AudioFixture extends EventTarget {
  paused = true; currentTime = 0; readyState = 0; duration = 0; src = '';
  pause() { this.paused = true; }
  play() { this.paused = false; return Promise.resolve(); }
  load() {}
  removeAttribute(name) { if (name === 'src') this.src = ''; }
}
globalThis.Audio = AudioFixture;
const { AudioEngine } = await import('../work/engine-cancellation.mjs');
const states = [];
const engine = new AudioEngine({ time() {}, state: state => states.push(state), ended() {}, error() {} });
const resumes = [];
engine.resume = () => new Promise(resolve => resumes.push(resolve));
engine.arm = () => {};
for (const deck of engine.decks) deck.fade = { gain: { value: 1, cancelScheduledValues() {} } };
const first = engine.load('old', 'https://example.invalid/old', { autoplay: true });
const latest = engine.load('new', 'https://example.invalid/new', { autoplay: true });
resumes[1]();
await latest;
resumes[0]();
await first;
assert.equal(engine.cur.key, 'new', 'A late previous track must not replace the current selection');
assert.equal(engine.cur.el.src, 'https://example.invalid/new');
const waiting = engine.load('cancelled', 'https://example.invalid/cancelled', { autoplay: true });
engine.pause();
resumes[2]();
await waiting;
assert.equal(engine.cur.key, 'new', 'Pause must cancel a load waiting for the audio context');
assert.equal(engine.cur.el.paused, true);
assert.equal(states.at(-1), 'paused');
console.log('PASS: late loads cannot replace the selected track; pause cancels pending startup');
