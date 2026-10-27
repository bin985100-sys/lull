import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import type { OverlayOptions, OverlayState } from '../shared/types';
import { IPC } from '../shared/api';
import { storeGet, storeSet } from './store';

/**
 * Оверлей с текстом песни: прозрачное окно поверх всех окон (в том числе игр в оконном режиме).
 * В «закреплённом» режиме клики проходят сквозь него.
 */
let win: BrowserWindow | null = null;
let options: OverlayOptions = { enabled: false, locked: true, fontSize: 34, lines: 2 };
let last: OverlayState | null = null;

function create(preload: string, load: (w: BrowserWindow, hash: string) => void) {
  const saved = storeGet<{ x: number; y: number; width: number; height: number }>('overlayBounds');
  const area = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    width: saved?.width ?? Math.min(1100, area.width - 80),
    height: saved?.height ?? 170,
    x: saved?.x ?? area.x + Math.round((area.width - Math.min(1100, area.width - 80)) / 2),
    y: saved?.y ?? area.y + area.height - 230,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    focusable: !options.locked,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: { preload, contextIsolation: true, sandbox: true }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  const save = () => win && !win.isDestroyed() && storeSet('overlayBounds', win.getBounds());
  win.on('moved', save);
  win.on('resized', save);
  win.on('closed', () => (win = null));
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send(IPC.overlayOptions, options);
    if (last) win?.webContents.send(IPC.overlayState, last);
  });
  load(win, '#/overlay');
  applyLock();
}

function applyLock() {
  if (!win) return;
  win.setIgnoreMouseEvents(options.locked, { forward: true });
  win.setFocusable(!options.locked);
}

export function configureOverlay(o: OverlayOptions, preload: string, load: (w: BrowserWindow, hash: string) => void) {
  options = o;
  storeSet('overlay', o);
  if (!o.enabled) {
    win?.close();
    win = null;
    return;
  }
  if (!win) create(preload, load);
  applyLock();
  win?.webContents.send(IPC.overlayOptions, options);
}

export function pushOverlay(s: OverlayState) {
  last = s;
  if (win && !win.isDestroyed()) win.webContents.send(IPC.overlayState, s);
}

export function restoreOverlay(preload: string, load: (w: BrowserWindow, hash: string) => void) {
  const saved = storeGet<OverlayOptions>('overlay');
  if (saved?.enabled) configureOverlay(saved, preload, load);
}

export const overlayPreload = (here: string) => path.join(here, 'preload.cjs');
