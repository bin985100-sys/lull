import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const executable = process.argv[2];
assert.ok(executable, 'Pass the packaged app executable');
fs.mkdirSync('test-results', { recursive: true });
const log = fs.openSync('test-results/packaged.log', 'w');
const testProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'lull-smoke-'));
const child = spawn(executable, [...(process.argv[3] ? [process.argv[3]] : []), '--remote-debugging-port=9222', `--user-data-dir=${testProfile}`], { stdio: ['ignore', log, log], env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' } });
let browser;
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { browser = await chromium.connectOverCDP('http://127.0.0.1:9222'); break; }
    catch { if (child.exitCode !== null) throw new Error('Packaged application exited early'); await new Promise(r => setTimeout(r, 1000)); }
  }
  assert.ok(browser, 'Packaged application did not open its window');
  let page;
  for (let attempt = 0; attempt < 60; attempt++) {
    page = browser.contexts()[0]?.pages().find(p => p.url().startsWith('file:'));
    if (page) break;
    await new Promise(r => setTimeout(r, 500));
  }
  assert.ok(page, 'Packaged application did not load its renderer');
  const failures = [];
  page.on('pageerror', e => failures.push(e.message));
  await page.waitForFunction(() => document.querySelector('#root')?.children.length && window.api, null, { timeout: 30000 });
  const probe = await build({entryPoints:['scripts/account-storage-probe.mjs'],bundle:true,format:'iife',globalName:'LullAccountStorageProbe',platform:'browser',write:false});
  await page.addScriptTag({content:probe.outputFiles[0].text});
  const accountStorage = await page.evaluate(() => window.LullAccountStorageProbe.runAccountStorageProbe({
    getItem:key=>window.api.accountStorage.get(key),setItem:(key,value)=>window.api.accountStorage.set(key,value),removeItem:key=>window.api.accountStorage.set(key,null)
  }));
  assert.equal(accountStorage.pkceSlots,2,'Packaged native storage must accept the actual SDK PKCE keys');
  const result = await page.evaluate(async () => {
    const home = await window.api.home();
    if (!home.some(section => section.items.length)) throw new Error('Empty home catalogue');
    const search = await window.api.search('Daft Punk', 'songs');
    if (!search.tracks?.length) throw new Error('Empty search results');
    const track = search.tracks[0];
    const start = performance.now();
    const hint = { title: track.title, artist: track.artists[0]?.name ?? '', duration: track.durationSec };
    try { await window.api.prepareStream(track.id, false, hint); }
    catch { await window.api.prepareStream(track.id, false, hint); }
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
  fs.writeFileSync('test-results/packaged.json', JSON.stringify({ platform: process.platform, arch: process.arch, accountStorage, ...result }, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser?.close().catch(() => {});
  child.kill('SIGTERM');
  fs.closeSync(log);
}
