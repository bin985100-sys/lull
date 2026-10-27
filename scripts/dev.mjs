import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { context } from 'esbuild';
import electronPath from 'electron';

// Если 5173 занят (например, остался старый запуск) — берём следующий свободный порт
// 127.0.0.1, а не localhost: на Windows localhost может уйти в IPv6, и окно Electron не достучится до сервера
const server = await createServer({ configFile: 'vite.config.mts', server: { host: '127.0.0.1', strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0];

const common = { bundle: true, platform: 'node', target: 'node22', sourcemap: true, packages: 'external', logLevel: 'info' };
let child;
const restart = () => {
  if (child) child.kill();
  child = spawn(electronPath, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } });
};
let ready = 0;
const plugin = { name: 'restart', setup(b) { b.onEnd(() => { ready++; if (ready >= 2) restart(); }); } };
const main = await context({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.mjs', format: 'esm', plugins: [plugin] });
const preload = await context({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs', format: 'cjs', plugins: [plugin] });
await main.watch();
await preload.watch();
process.on('SIGINT', () => { child?.kill(); process.exit(0); });
