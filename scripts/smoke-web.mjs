import { chromium, webkit, devices } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';

fs.mkdirSync('test-results', { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', 'dist-web', '--host', '127.0.0.1', '--port', '4173'], { stdio: 'ignore' });
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch('http://127.0.0.1:4173')).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  for (const [name, engine, device] of [['android', chromium, 'Pixel 7'], ['iphone', webkit, 'iPhone 13']]) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ ...devices[device] });
      await context.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:4173');
      await page.locator('.m-tabs').waitFor();
      await page.waitForFunction(() => document.querySelectorAll('.card').length > 0 || document.querySelectorAll('.track-row').length > 0, { timeout: 60000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Horizontal overflow');
      assert.equal(await page.locator('.inst-back').count(), 0, 'Installed application must not show install prompts');
      await page.screenshot({ path: `test-results/${name}-home.png`, fullPage: true });
      await page.locator('.m-tab').filter({ hasText: 'Поиск' }).click();
      await page.locator('input').first().fill('Daft Punk');
      await page.waitForFunction(() => document.querySelectorAll('.track-row').length > 0, { timeout: 60000 });
      await page.screenshot({ path: `test-results/${name}-search.png`, fullPage: true });
      assert.deepEqual(errors, [], `${name} renderer exceptions`);
      fs.writeFileSync(`test-results/${name}.json`, JSON.stringify({ mobileLayout: true, search: true, rendererErrors: errors }, null, 2));
    } finally { await browser.close(); }
  }
} finally { server.kill(); }
