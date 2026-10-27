import { build, context } from 'esbuild';
import fs from 'node:fs';
import { loadEnv } from 'vite';

// Строка сервера Lull: секрет LULL_RELAY или локальный файл relay.local (оба не попадают в git)
const relay = (process.env.LULL_RELAY || (fs.existsSync('relay.local') ? fs.readFileSync('relay.local', 'utf8') : '')).trim();

const watch = process.argv.includes('--watch');
const accounts = (process.env.VITE_ACCOUNTS_ENABLED ?? loadEnv(watch ? 'development' : 'production', process.cwd(), 'VITE_').VITE_ACCOUNTS_ENABLED) === 'true';
const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  packages: 'external',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production'), __LULL_RELAY__: JSON.stringify(relay), __LULL_ACCOUNTS_ENABLED__: JSON.stringify(accounts) }
};
const configs = [
  { ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.mjs', format: 'esm' },
  { ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs', format: 'cjs' }
];

if (watch) {
  for (const c of configs) (await context(c)).watch();
} else {
  await Promise.all(configs.map((c) => build(c)));
}
