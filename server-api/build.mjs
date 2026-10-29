// Сборка Lull API в один файл: node server-api/build.mjs → dist-server/lull-api.mjs
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const shim = (name) => path.join(here, 'shims', `${name}.ts`);
await build({
  entryPoints: [path.join(here, 'main.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: path.join(here, '..', 'dist-server', 'lull-api.mjs'),
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  plugins: [{
    name: 'shims',
    setup(b) {
      b.onResolve({ filter: /^electron$/ }, () => ({ path: shim('electron') }));
      b.onResolve({ filter: /^\.\/(relay|ytdlp)$/ }, (a) => (a.importer.includes(`${path.sep}electron${path.sep}`) ? { path: shim(a.path.slice(2)) } : undefined));
    }
  }],
  logLevel: 'info'
});
