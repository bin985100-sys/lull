import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';


// iOS: заставки при запуске с экрана «Домой» (портрет), CSS px × dpr
const SPLASH: [number, number, number][] = [[430, 932, 3], [393, 852, 3], [390, 844, 3], [428, 926, 3], [375, 812, 3], [414, 896, 2], [414, 896, 3], [375, 667, 2], [440, 956, 3], [402, 874, 3], [320, 568, 2], [834, 1194, 2], [820, 1180, 2], [1024, 1366, 2]];

/** Веб-сборка (vite --mode web): «как приложение из App Store» — полноэкранный режим, иконки, заставки, офлайн-оболочка. */
function webApp(API: string, BUILD: string): Plugin {
  return {
    name: 'lull-web-app',
    transformIndexHtml(html) {
      const csp = `default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob: data: ${API}; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https://www.googleapis.com https://sluzyoctsnncbwfqybca.supabase.co wss://sluzyoctsnncbwfqybca.supabase.co ${API} https://lull.website; font-src 'self' data:; manifest-src 'self'`;
      const head = [
        `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content" />`,
        `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
        `<meta name="theme-color" content="#0B0B0E" />`,
        `<meta name="color-scheme" content="dark" />`,
        `<meta name="description" content="Lull — музыка, которая знает тебя" />`,
        `<meta name="mobile-web-app-capable" content="yes" />`,
        `<meta name="apple-mobile-web-app-capable" content="yes" />`,
        `<meta name="apple-mobile-web-app-title" content="Lull" />`,
        `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`,
        `<meta name="format-detection" content="telephone=no, email=no, address=no" />`,
        `<link rel="manifest" href="/manifest.webmanifest" />`,
        `<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml" />`,
        `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />`,
        `<link rel="preconnect" href="${API}" crossorigin />`,
        ...SPLASH.map(([w, h, d]) => `<link rel="apple-touch-startup-image" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${d}) and (orientation: portrait)" href="/splash/${w}x${h}@${d}.jpg" />`)
      ].join('\n    ');
      return html
        .replace(/<meta name="viewport"[^>]*>/, '')
        .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, head)
        .replace('</body>', `<script>if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js'))</script>\n  </body>`);
    },
    closeBundle() {
      const f = 'dist-web/sw.js';
      if (fs.existsSync(f)) fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('__BUILD__', BUILD));
    }
  };
}

export default defineConfig(({ mode }) => {
  const web = mode === 'web';
  const API = process.env.VITE_LULL_API ?? 'https://api.lull.website';
  const BUILD = String(Date.now());
  return {
  base: web ? '/' : './',
  plugins: [react(), ...(web ? [webApp(API, BUILD)] : [])],
  define: { 'import.meta.env.VITE_TARGET': JSON.stringify(web ? 'web' : 'desktop'), 'import.meta.env.VITE_LULL_API': JSON.stringify(API) },
  publicDir: web ? 'public' : false,
  server: { port: 5173, strictPort: true },
  build: { outDir: web ? 'dist-web' : 'dist', emptyOutDir: true, target: web ? ['es2022', 'safari16', 'chrome110'] : 'chrome130' }
  };
});
