import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

fs.mkdirSync('test-results/responsive', { recursive: true });
const cover = color => 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${color}"/></svg>`).toString('base64');
const tracks = [0, 1, 2].map((n) => ({ id: `ui-${n}`, title: n ? 'Следующий трек' : 'Очень длинное название композиции, которое должно помещаться на любом телефоне', artists: [{ name: 'Исполнитель с длинным именем' }], durationSec: 240, thumb: cover(['#dd5522', '#2277dd', '#33cc77'][n]) }));
const browser = await chromium.launch();
try {
  for (const [width, height] of [[320,568], [360,800], [393,852], [430,932], [1280,800]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 760 });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:5188');
      await page.waitForFunction(() => !!window.__stores);
      await page.evaluate(async tracks => {
        const { usePlayer, useSettings, useLyrics } = window.__stores;
        const { useUi } = await import('/src/store/ui.ts');
        window.__ui = useUi;
        useSettings.setState({ waveIntro: false, waveIntroSeen: true, waveStarted: true, animatedBg: false });
        usePlayer.setState({ queue: tracks, index: 0, source: { path: '/wave', label: 'Волна' }, loading: false, playing: false, duration: 240 });
        useLyrics.setState({ trackId: tracks[0].id, loading: false, data: { plain: 'Первая строка\nВторая строка', source: 'test' } });
        location.hash = '#/wave';
      }, tracks);
      await page.locator('.wave-panel').waitFor();
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.scroll > div')).opacity) > 0.99);
      const checkWidth = async selectors => {
        for (const selector of selectors) {
          const boxes = await page.locator(selector).evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height }; }));
          assert.ok(boxes.length, `${width}: missing ${selector}`);
          for (const box of boxes) assert.ok(box.left >= -1 && box.right <= width + 1, `${width}: ${selector} exceeds screen: ${JSON.stringify(box)}`);
        }
      };
      await checkWidth(['.wave-cover', '.wave-info', '.wave-panel', '.wave-ctrls button', '.wave-chip']);
      await page.screenshot({ path: `test-results/responsive/wave-${width}.png` });
      await page.evaluate(() => window.__stores.usePlayer.setState({ loading: true, playing: true }));
      await page.locator('.wave-btn.play[aria-busy="true"] .playback-spinner').waitFor();
      await page.evaluate(() => window.__stores.usePlayer.setState({ loading: false, playing: false }));
      if (width < 760) {
        await page.locator('.wave-chip').filter({ hasText: 'Текст' }).click();
        await page.locator('.np-grid.np-panel-open').waitFor();
        await page.locator('.np-player').waitFor({ state: 'hidden' });
        await page.locator('.np-lyrics').getByText('Первая строка', { exact: false }).waitFor();
        await checkWidth(['.np-head', '.np-seg button', '.np-side']);
        await page.screenshot({ path: `test-results/responsive/lyrics-${width}.png` });
        await page.getByRole('tab', { name: 'Очередь', exact: true }).click();
        assert.equal(await page.locator('.np-side').getAttribute('aria-label'), 'Очередь');
        assert.equal(await page.locator('.np-side').evaluate(el => { const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1; }), true, 'Queue must be in the visible viewport, not below the cover');
        await page.screenshot({ path: `test-results/responsive/queue-${width}.png` });
        await page.getByRole('button', { name: 'Вернуться к плееру', exact: true }).click();
        await page.locator('.np-player').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.np-seg [aria-selected="true"]').count(), 0);
        await page.getByRole('button', { name: 'Свернуть плеер', exact: true }).click();
        await page.locator('.np').waitFor({ state: 'detached' });
      }
      await page.locator('.wave-chip').filter({ hasText: 'Плеер' }).click();
      await page.locator('.np-play').waitFor();
      await checkWidth(['.np-cover-wrap', '.np-meta', '.np-ctrls', '.np-ctrls > button']);
      await page.screenshot({ path: `test-results/responsive/player-${width}.png` });
      // A failed image must not poison the next track's artwork.
      await page.evaluate(() => {
        const p = window.__stores.usePlayer;
        const queue = [...p.getState().queue];
        queue[1] = { ...queue[1], thumb: '/missing-cover-image.png' };
        p.setState({ queue, index: 1 });
      });
      await page.locator('.np-cover2 .ph').waitFor();
      await page.evaluate(() => window.__stores.usePlayer.setState({ index: 2 }));
      await page.locator('.np-cover2 img.cover.ready').waitFor();
      assert.equal(await page.locator('.np-cover2 .ph').count(), 0);
      assert.deepEqual(errors, [], `${width}: renderer errors`);
      console.log(`PASS ${width}x${height}: wave, player, lyrics/queue, loading indicator, artwork recovery`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
