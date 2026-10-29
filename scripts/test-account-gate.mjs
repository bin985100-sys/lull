import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', 'work/account-gate-dist', '--host', '127.0.0.1', '--port', '5189', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch('http://127.0.0.1:5189')).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  browser = await chromium.launch();
  for (const width of [320, 393, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 800 }, serviceWorkers: 'block' });
    const catalogue = [];
    page.on('request', r => { if (r.url().includes('api.lull.website')) catalogue.push(r.url()); });
    await page.goto('http://127.0.0.1:5189');
    await page.getByRole('button', { name: 'Продолжить с Google' }).waitFor();
    assert.equal(await page.locator('.m-tabs,.sidebar').count(), 0, 'Unauthenticated users cannot access player navigation');
    assert.equal(await page.locator('input').count(), 0, 'Email/password signup must not appear');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(catalogue, [], 'Protected app must not bootstrap before sign-in');
    fs.mkdirSync('test-results/accounts', { recursive: true });
    await page.screenshot({ path: `test-results/accounts/login-${width}.png` });
    await page.route('**/auth/v1/authorize**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>OAuth provider boundary fixture</p>' }));
    for (const provider of ['google', 'discord']) {
    if (provider === 'discord') await page.goto('http://127.0.0.1:5189');
    const requested = page.waitForRequest(r => r.url().includes('/auth/v1/authorize'));
    await page.getByRole('button', { name: `Продолжить с ${provider === 'google' ? 'Google' : 'Discord'}` }).click();
    const url = new URL((await requested).url());
    assert.equal(url.searchParams.get('provider'), provider);
    assert.equal(url.searchParams.get('redirect_to'), 'http://127.0.0.1:5189/auth/callback');
    assert.equal(url.searchParams.get('code_challenge_method'), 's256');
    assert.ok(url.searchParams.get('code_challenge'));
    if (provider === 'google') assert.ok(url.searchParams.get('scopes').includes('youtube.readonly'));
    else {
      assert.equal(url.searchParams.get('scopes'), 'identify email');
      assert.equal(url.searchParams.has('access_type'), false, 'Google options must not leak into Discord login');
    }
    }
    await page.close();
  }
  console.log('Login gate: mobile/desktop layout, Google and Discord PKCE, provider-specific scopes and no unauthenticated app bootstrap passed. Real consent not tested.');
} finally { await browser?.close(); server.kill(); }
