import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = 'http://127.0.0.1:5191';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5191', '--strictPort'], { stdio: 'ignore' });
const cover = color => 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${color}"/></svg>`).toString('base64');
const tracks = ['#dd5522', '#2277dd'].map((color, n) => ({ id: `safe-${n}`, title: 'Длинное название композиции без обрезания управления', artists: [{ name: 'Исполнитель с очень длинным именем' }], durationSec: 240, thumb: cover(color) }));
fs.mkdirSync('test-results/mobile-safe-area', { recursive: true });
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      const gpuPage = await browser.newPage({ viewport: { width:393, height:852 } });
      await gpuPage.goto(base);
      await gpuPage.waitForFunction(() => !!window.__stores);
      await gpuPage.evaluate(() => window.__stores.useSettings.setState({ background:'gradient' }));
      await gpuPage.locator('.ambient-wrap .livebg').waitFor();
      const gpu = await gpuPage.evaluate(() => {
        const canvas = document.querySelector('.ambient-wrap .livebg');
        const gl = canvas.getContext('webgl');
        if (!gl) return { available:false };
        const extension = gl.getExtension('WEBGL_lose_context');
        window.__restoreBackground = () => extension?.restoreContext();
        window.__loseBackground = () => extension?.loseContext();
        return { available:true, lost:gl.isContextLost(), fallback:canvas.dataset.fallback, restorable:!!extension };
      });
      if (gpu.available) {
        assert.equal(gpu.lost, false, 'React cleanup must not destroy the reused WebGL context');
        assert.equal(gpu.fallback, undefined, 'Background shader must initialise');
        if (gpu.restorable) {
          await gpuPage.evaluate(() => window.__loseBackground());
          await gpuPage.locator('.livebg[data-fallback="1"]').waitFor();
          await gpuPage.evaluate(() => window.__restoreBackground());
          await gpuPage.waitForFunction(() => {
            const canvas = document.querySelector('.ambient-wrap .livebg');
            return !canvas.dataset.fallback && !canvas.getContext('webgl').isContextLost() && canvas.width > 0;
          });
        }
        console.log(`PASS ${engine.name()}: WebGL initialisation and ${gpu.restorable ? 'context recovery' : 'available context'}`);
      } else console.log(`INFO ${engine.name()}: WebGL unavailable; colour fallback tested below`);
      await gpuPage.close();
      for (const [width, height, top, bottom, side] of [[320,568,0,0,0], [393,852,59,34,0], [430,932,59,34,0], [852,393,0,21,59]]) {
        const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        // Mobile GPUs may be unavailable or lose contexts: the colour fallback must still update.
        await page.addInitScript(() => {
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
            return /webgl/.test(kind) ? null : original.call(this, kind, ...args);
          };
        });
        await page.goto(base);
        await page.waitForFunction(() => !!window.__stores);
        await page.addStyleTag({ content: `:root { --safe-top:${top}px;--safe-bottom:${bottom}px;--safe-left:${side}px;--safe-right:${side}px; }` });
        await page.evaluate(async tracks => {
          const { usePlayer, useSettings } = window.__stores;
          useSettings.setState({ waveIntro: false, waveIntroSeen: true, waveStarted: true, animatedBg: false, background: 'gradient' });
          usePlayer.setState({ queue: tracks, index: 0, source: { path: '/wave', label: 'Волна' }, loading: false, playing: false, duration: 240 });
          location.hash = '#/wave';
        }, tracks);
        await page.locator('.app.mobile .wave-panel').waitFor();
        await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.scroll > div')).opacity) > .99);
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.wave-panel')).transform === 'none');
        const check = async (selectors, aboveDock = false) => {
          for (const selector of selectors) {
            const boxes = await page.locator(selector).evaluateAll(nodes => nodes.map(el => {
              const r = el.getBoundingClientRect(); const dock = document.querySelector('.m-dock').getBoundingClientRect();
              return { x:r.x, right:r.right, y:r.y, bottom:r.bottom, w:r.width, h:r.height, dock:dock.top };
            }));
            assert.ok(boxes.length, `missing ${selector}`);
            for (const b of boxes) {
              assert.ok(b.x >= side - 1 && b.right <= width - side + 1, `${engine.name()} ${width} ${selector} clips: ${JSON.stringify(b)}`);
              if (aboveDock) assert.ok(b.y >= top && b.bottom <= b.dock + 1, `${engine.name()} ${width} ${selector} hidden behind navigation: ${JSON.stringify(b)}`);
            }
          }
        };
        await check(['.wave-cover', '.wave-info', '.wave-panel', '.wave-ctrls button', '.wave-chip'], true);
        for (const selector of ['.wave-btn', '.wave-chip']) {
          assert.ok(await page.locator(selector).evaluateAll(nodes => nodes.every(el => { const r = el.getBoundingClientRect(); return r.width >= 43.5 && r.height >= 43.5; })), `${selector}: touch targets must not shrink`);
        }
        const tint = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tint'));
        await page.evaluate(() => window.__stores.usePlayer.setState({ index: 1 }));
        await page.waitForFunction(old => getComputedStyle(document.documentElement).getPropertyValue('--tint') !== old, tint);
        const newTint = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tint').trim());
        assert.match(newTint, /^#/);
        await page.waitForFunction(() => {
          const img = document.querySelector('.wave-cover img.cover.ready');
          return img && Number(getComputedStyle(img).opacity) > .99;
        });
        await page.screenshot({ path: `test-results/mobile-safe-area/${engine.name()}-wave-${width}.png` });
        await page.evaluate(async tracks => {
          const { api } = await import('/src/api.ts');
          api.artist = async () => ({ id:'safe-artist', name:'Очень длинное имя исполнителя для проверки краёв', thumb:tracks[0].thumb, verified:true, topTracks:tracks, sections:[] });
          location.hash = '#/artist/safe-artist';
        }, tracks);
        await page.locator('.artist-meta').waitFor();
        await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.scroll > div')).opacity) > .99);
        await check(['.artist-head', '.artist-ava', '.artist-meta', '.artist-name', '.artist-btns', '.artist-btns button', '.artist-top']);
        assert.ok(await page.locator('.artist-btns .sq').evaluateAll(nodes => nodes.every(el => { const r = el.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })));
        await page.screenshot({ path: `test-results/mobile-safe-area/${engine.name()}-artist-${width}.png` });
        assert.deepEqual(errors, []);
        console.log(`PASS ${engine.name()} ${width}x${height}: safe areas, visible Wave controls, artist layout, cover tint without WebGL`);
        await context.close();
      }
    } finally { await browser.close(); }
  }
} finally { server.kill(); }
