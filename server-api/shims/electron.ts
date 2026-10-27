// Заглушка Electron для серверной сборки каталога (Node без Electron)
import path from 'node:path';
const DATA = process.env.LULL_API_DATA || '/var/lib/lull-relay/api';
export const app = {
  getPath: (_: string) => DATA,
  getVersion: () => '1.0.0',
  isPackaged: true
};
export const net = { fetch: (input: any, init?: any) => globalThis.fetch(input, init) };
export const session = { defaultSession: {} as any };
export type WebContents = { send: (...a: unknown[]) => void };
export default { app, net, session, path };
