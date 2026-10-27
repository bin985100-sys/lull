import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const executable = process.argv[2];
assert.ok(executable, 'Pass the packaged app executable');
fs.mkdirSync('test-results', { recursive: true });
const log = fs.openSync('test-results/packaged.log', 'w');
const child = spawn(executable, ['--remote-debugging-port=9222'], { stdio: ['ignore', log, log], env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' } });
let browser;
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { browser = await chromium.connectOverCDP('http://127.0.0.1:9222'); break; }
    catch { if (child.exitCode !== null) throw new Error('Packaged application exited early'); await new Promise(r => setTimeout(r, 1000)); }
  }
  assert.ok(browser, 'Packaged application did not open its window');
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('file:')) ?? browser.contexts()[0].pages()[0];
  const failures = [];
  page.on('pageerror', e => failures.push(e.message));
  await page.waitForFunction(() => document.querySelector('#root')?.children.length && window.api, { timeout: 30000 });
  const result = await page.evaluate(async () => {
    const home = await window.api.home();
    if (!home.some(section => section.items.length)) throw new Error('Empty home catalogue');
    const search = await window.api.search('Daft Punk', 'songs');
    if (!search.tracks?.length) throw new Error('Empty search results');
    const track = search.tracks[0];
    const start = performance.now();
    await window.api.prepareStream(track.id, false, { title: track.title, artist: track.artists.map(a => a.name).join(', ') });
    const audio = new Audio(window.api.streamUrl(track.id));
    audio.muted = true;
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Audio did not start within 45 seconds')), 45000));
    const playing = new Promise((resolve, reject) => {
      audio.addEventListener('error', () => reject(new Error('Audio decode/network error: ' + audio.error?.code)));
      audio.addEventListener('timeupdate', () => { if (audio.currentTime > 0.3) resolve({ title: track.title, ms: Math.round(performance.now() - start), position: audio.currentTime }); });
      audio.play().catch(reject);
    });
    const playback = await Promise.race([playing, timeout]);
    audio.pause(); audio.removeAttribute('src'); audio.load();
    return { sections: home.length, searchTracks: search.tracks.length, playback };
  });
  await page.screenshot({ path: 'test-results/packaged-home.png' });
  assert.deepEqual(failures, [], 'Renderer exceptions');
  fs.writeFileSync('test-results/packaged.json', JSON.stringify({ platform: process.platform, arch: process.arch, ...result }, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser?.close().catch(() => {});
  child.kill('SIGTERM');
  fs.closeSync(log);
}
