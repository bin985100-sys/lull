import { app, ipcMain, safeStorage, type WebContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { IPC } from '../shared/api';
import { assertAccountStorageKey } from '../shared/account-storage';

let pending: string | null = null;
export function receiveAccountUrl(raw: string, contents?: WebContents) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'lull:' || url.hostname !== 'auth' || url.pathname !== '/callback' || raw.length > 8192) return;
    pending = raw;
    contents?.send(IPC.accountCallbackEvent, raw);
  } catch { /* An unrelated command-line argument is not an auth callback. */ }
}

export function registerAccountIpc(contents: () => WebContents | undefined) {
  const file = (key: string) => {
    assertAccountStorageKey(key);
    if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) throw new Error('Secure account storage unavailable');
    return path.join(app.getPath('userData'), 'account', `${key}.bin`);
  };
  const verify = (sender: WebContents) => {
    if (sender !== contents()) throw new Error('Account access denied');
  };
  ipcMain.handle(IPC.accountStorageGet, (e, key: string) => {
    verify(e.sender);
    const target = file(key);
    return fs.existsSync(target) ? safeStorage.decryptString(fs.readFileSync(target)) : null;
  });
  ipcMain.handle(IPC.accountStorageSet, (e, key: string, value: string | null) => {
    verify(e.sender);
    const target = file(key);
    if (value === null) { fs.rmSync(target, { force: true }); return; }
    if (typeof value !== 'string' || value.length > 100_000) throw new Error('Invalid account session');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target + '.tmp', safeStorage.encryptString(value), { mode: 0o600 });
    fs.renameSync(target + '.tmp', target);
  });
  ipcMain.handle(IPC.accountCallback, (e) => {
    verify(e.sender);
    const url = pending; pending = null; return url;
  });
}
