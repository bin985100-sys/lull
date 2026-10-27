import type { Api } from '../shared/api';
import { mockApi } from './mock/api';
import { httpApi } from './web/httpApi';

declare global {
  interface Window {
    api?: Api;
  }
}

/** Веб-сборка (сайт, PWA, Android) — сервер Lull; в Electron — мост из preload; в dev:web — тестовые данные. */
export const isWebBuild = import.meta.env.VITE_TARGET === 'web';
export const api: Api = { ...(window.api ?? (isWebBuild ? httpApi : mockApi)) };
export const isMock = !window.api && !isWebBuild;
export const isDesktop = !!window.api;
