import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:5192';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5192', '--strictPort'], { stdio:'ignore' });
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  for (const engine of [chromium, webkit]) {
    // Playwright's Windows WebKit has no working audio clock/output. Safari audio
    // compatibility is mandatory on the Linux CI runner, not claimed on Windows.
    if (engine === webkit && process.platform === 'win32') {
      if (process.env.CI) throw new Error('Run WebKit audio compatibility on the Linux CI job');
      console.log('UNVERIFIED local Windows WebKit audio: decoder playback must pass on Linux CI');
      continue;
    }
    const browser = await engine.launch();
    try {
      for (const mode of ['absent', 'throwing', 'prefixed']) {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(mode => {
          const original = window.AudioContext ?? window.webkitAudioContext;
          Object.defineProperty(window, 'AudioContext', { configurable:true, value:mode === 'throwing' ? class { constructor() { throw new Error('Audio graph unavailable'); } } : undefined });
          Object.defineProperty(window, 'webkitAudioContext', { configurable:true, value:mode === 'prefixed' ? original : undefined });
        }, mode);
        await page.goto(base);
        const canDecode = await page.evaluate(() => new Audio().canPlayType('audio/wav'));
        if (!canDecode) {
          if (process.env.CI) throw new Error(`${engine.name()}: test runner has no PCM decoder`);
          console.log(`UNVERIFIED ${engine.name()}: this local browser build has no PCM audio decoder; real decoder checks run in Linux CI`);
          await page.close();
          break;
        }
        await page.evaluate(async () => {
          const { AudioEngine } = await import('/src/player/engine.ts');
          // A short local PCM file isolates decoder/control compatibility from provider latency.
          const pcm = new ArrayBuffer(44 + 44100 * 2 * 3);
          const data = new DataView(pcm);
          const tag = (offset, text) => [...text].forEach((c,i) => data.setUint8(offset+i,c.charCodeAt(0)));
          tag(0,'RIFF'); data.setUint32(4,pcm.byteLength-8,true); tag(8,'WAVE'); tag(12,'fmt ');
          data.setUint32(16,16,true); data.setUint16(20,1,true); data.setUint16(22,1,true);
          data.setUint32(24,44100,true); data.setUint32(28,88200,true); data.setUint16(32,2,true); data.setUint16(34,16,true);
          tag(36,'data'); data.setUint32(40,pcm.byteLength-44,true);
          const url = URL.createObjectURL(new Blob([pcm], { type:'audio/wav' }));
          window.__compat = new AudioEngine({ time(){}, ended(){}, state(){}, error(message){ throw new Error(message); } });
          window.__compat.setVolume(0);
          const button = document.createElement('button'); button.textContent='Start compatibility audio';
          button.onclick = () => void window.__compat.load('first',url,{autoplay:true});
          document.body.append(button);
          const next = document.createElement('button'); next.textContent='Next compatibility audio';
          next.onclick = () => void window.__compat.crossfade('second',url,.1);
          document.body.append(next);
        });
        await page.getByRole('button', {name:'Start compatibility audio', exact:true}).click();
        await page.waitForFunction(() => window.__compat.isPlaying && window.__compat.position > .15, null, {timeout:15000}).catch(async e => {
          throw new Error(`${engine.name()} ${mode}: ${e.message}; ${JSON.stringify(await page.evaluate(() => ({position:window.__compat.position, playing:window.__compat.isPlaying, decks:window.__compat.decks.map(d=>({paused:d.el.paused,ready:d.el.readyState,error:d.el.error?.message}))})))}; errors=${errors.join(', ')}`);
        });
        await page.getByRole('button', {name:'Next compatibility audio', exact:true}).click();
        await page.waitForFunction(() => window.__compat.isPlaying && window.__compat.position > .15, null, {timeout:15000});
        await page.evaluate(() => window.__compat.pause());
        assert.equal(await page.evaluate(() => window.__compat.isPlaying),false);
        await page.evaluate(() => window.__compat.stop());
        assert.deepEqual(errors,[]);
        console.log(`PASS ${engine.name()}: actual audio playback, next track and pause with ${mode} AudioContext`);
        await page.close();
      }
    } finally { await browser.close(); }
  }
} finally { server.kill(); }
