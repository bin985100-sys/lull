import { globalShortcut, type BrowserWindow } from 'electron';
import { IPC } from '../shared/api';
import type { HotkeyAction } from '../shared/types';

/**
 * Глобальные горячие клавиши: работают, даже когда окно свёрнуто или в фокусе игра.
 * «Показать окно» обрабатываем здесь, остальное пересылаем в интерфейс.
 */
let current: Partial<Record<HotkeyAction, string>> = {};

export function setHotkeys(map: Partial<Record<HotkeyAction, string>>, getWin: () => BrowserWindow | null) {
  for (const acc of Object.values(current)) if (acc) globalShortcut.unregister(acc);
  current = { ...map };
  const status: Partial<Record<HotkeyAction, boolean>> = {};
  for (const [action, acc] of Object.entries(map) as [HotkeyAction, string][]) {
    if (!acc) continue;
    try {
      status[action] = globalShortcut.register(acc, () => {
        const win = getWin();
        if (!win) return;
        if (action === 'showWindow') {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
          return;
        }
        win.webContents.send(IPC.hotkey, action);
      });
    } catch {
      status[action] = false;
    }
  }
  return status;
}

export function clearHotkeys() {
  globalShortcut.unregisterAll();
}
