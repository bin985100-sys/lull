/**
 * Проверка импорта на реальных ссылках (запускать на своём компьютере, нужен интернет):
 *   npm run test:import
 *   npm run test:import -- https://open.spotify.com/playlist/... https://soundcloud.com/.../sets/...
 * Показывает, сколько треков удалось прочитать из каждого сервиса и первые названия.
 * Поиск совпадений на YouTube Music здесь не делается — только чтение списка.
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'imp-'));
const out = join(dir, 'sources.mjs');
await build({ entryPoints: ['electron/sources.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' });
const src = await import(pathToFileURL(out).href);

const defaults = [
  'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', // Today's Top Hits
  'https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy', // альбом
];
const urls = process.argv.slice(2).length ? process.argv.slice(2) : defaults;
const kind = (u) => (/spotify/.test(u) ? 'spotify' : /soundcloud/.test(u) ? 'soundcloud' : null);

let fail = 0;
for (const u of urls) {
  const k = kind(u);
  if (!k) { console.log('?', u, '— неизвестный сервис'); continue; }
  try {
    const t0 = Date.now();
    const r = await src[k](u, fetch);
    const ok = r.items.length > 0;
    if (!ok) fail++;
    console.log(`${ok ? '✓' : '✗'} ${k.padEnd(10)} «${r.name}» — ${r.items.length}${r.declared ? ` из ${r.declared}` : ''} треков, ${Date.now() - t0} мс`);
    for (const it of r.items.slice(0, 3)) console.log(`     ${it.artist} — ${it.title}${it.durationSec ? ` (${Math.floor(it.durationSec / 60)}:${String(it.durationSec % 60).padStart(2, '0')})` : ''}`);
  } catch (e) {
    fail++;
    console.log(`✗ ${k.padEnd(10)} ${u}\n     ${e.message}`);
  }
}
rmSync(dir, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
