import { chromium, webkit, devices } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';

fs.mkdirSync('test-results', { recursive: true });
const stagedCorsFix = process.argv.includes('--stage-cors-fix');
const query = process.argv.find(x => x.startsWith('--query='))?.slice(8) ?? 'Daft Punk';
const suffix = process.argv.find(x => x.startsWith('--label='))?.slice(8).replace(/[^a-z0-9_-]/gi, '') ?? '';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', 'dist-web', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'ignore' });
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  for (const [name, engine, device] of [['android', chromium, 'Pixel 7'], ['iphone', webkit, 'iPhone 13']]) {
    if (process.argv.includes('--chromium-only') && name !== 'android') continue;
    if (process.argv.includes('--webkit-only') && name !== 'iphone') continue;
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ ...devices[device], serviceWorkers: stagedCorsFix ? 'block' : 'allow' });
      if (stagedCorsFix) {
        // Preview the separately regression-tested server header fix. Production
        // checks never use this option and still fail until the server is updated.
        await context.route('https://api.lull.website/api/**', async route => {
          if (new URL(route.request().url()).pathname.startsWith('/api/stream/')) return route.continue();
          try {
            const response = await route.fetch({ timeout: 60000 });
            await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': 'http://127.0.0.1:5173', vary: 'Origin' } });
          } catch { await route.abort().catch(() => {}); }
        });
      }
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'standalone', { get: () => true });
        window.__qaAudio = [];
        const original = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
          this.muted = true;
          if (!window.__qaAudio.includes(this)) window.__qaAudio.push(this);
          return original.call(this);
        };
      });
      const page = await context.newPage();
      const errors = [];
      const network = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', message => { if (message.type() === 'error') network.push(message.text()); });
      page.on('requestfailed', request => network.push(request.url() + ': ' + request.failure()?.errorText));
      await page.goto('http://127.0.0.1:5173');
      await page.locator('.m-tabs').waitFor();
      await page.waitForFunction(() => document.querySelectorAll('.card[role="link"],.trow').length > 0, null, { timeout: 60000 }).catch(async error => {
        await page.screenshot({ path: `test-results/${name}-failure.png`, fullPage: true });
        throw new Error(error.message + '\n' + await page.locator('body').innerText() + '\n' + network.join('\n'));
      });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Horizontal overflow');
      assert.equal(await page.locator('.inst-back').count(), 0, 'Installed application must not show install prompts');
      await page.screenshot({ path: `test-results/${name}-home.png`, fullPage: true });
      await page.locator('.m-tab').filter({ hasText: 'Поиск' }).click();
      await page.locator('input').first().fill(query);
      await page.locator('input').first().press('Enter');
      await page.getByRole('heading', { name: 'Треки', exact: true }).waitFor({ timeout: 60000 });
      await page.waitForFunction(() => document.querySelectorAll('.trow').length > 0, null, { timeout: 60000 });
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.scroll > div')).opacity) > 0.99);
      assert.equal(await page.evaluate(() => {
        const sections = [...document.querySelectorAll('.page .section')];
        return sections.length > 0 && sections.every(section => section.getBoundingClientRect().right <= innerWidth + 1);
      }), true, 'Search sections must fit the phone screen');
      await page.screenshot({ path: `test-results/${name}-search.png`, fullPage: true });
      if (process.argv.includes('--layout-only')) {
        assert.deepEqual(errors, [], `${name} renderer exceptions`);
        fs.writeFileSync(`test-results/${name}-layout.json`, JSON.stringify({ mobileLayout: true, search: true, stagedCorsFix, audioVerified: false, rendererErrors: errors }, null, 2));
        console.log(name, 'layout and search passed; audio not checked in this run');
        continue;
      }
      const start = Date.now();
      await page.locator('.trow .tt').first().click();
      await page.waitForFunction(() => window.__qaAudio.some(audio => !audio.paused && audio.currentTime > 0.3), null, { timeout: 60000 }).catch(async error => {
        const audio = await page.evaluate(() => window.__qaAudio.map(a => ({ paused:a.paused, time:a.currentTime, ready:a.readyState, network:a.networkState, error:a.error?.message, buffered:Array.from({ length:a.buffered.length }, (_, i) => [a.buffered.start(i), a.buffered.end(i)]) })));
        const failure = { query, elapsedMs:Date.now() - start, audio, rendererErrors:errors, network };
        fs.writeFileSync(`test-results/${name}-audio-failure.json`, JSON.stringify(failure, null, 2));
        await page.screenshot({ path:`test-results/${name}-audio-failure.png`, fullPage:true });
        throw new Error(error.message + '\n' + JSON.stringify(failure));
      });
      const playbackMs = Date.now() - start;
      await page.screenshot({ path: `test-results/${name}-playing.png`, fullPage: true });
      assert.deepEqual(errors, [], `${name} renderer exceptions`);
      const title = await page.locator('.trow .tt').first().innerText();
      const result = { mobileLayout: true, search: true, query, title, playbackMs, stagedCorsFix, rendererErrors: errors };
      console.log(name, JSON.stringify(result));
      fs.writeFileSync(`test-results/${name}${suffix ? '-' + suffix : ''}.json`, JSON.stringify(result, null, 2));
    } finally { await browser.close(); }
  }
} finally { server.kill(); }
