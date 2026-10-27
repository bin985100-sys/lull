import { create } from 'zustand';
import type { ReactNode } from 'react';
import { uid } from '../lib/format';
import { invalidateQueries } from '../lib/useQuery';

export interface MenuItem {
  label?: string;
  icon?: ReactNode;
  danger?: boolean;
  divider?: boolean;
  onClick?: () => void;
  submenu?: MenuItem[];
}

export interface Toast {
  id: string;
  text: string;
  kind: 'info' | 'error' | 'ok';
}

interface UiState {
  menu: { x: number; y: number; items: MenuItem[] } | null;
  nowPlaying: boolean;
  nowPlayingPanelRequested: boolean;
  nowPlayingTab: 'lyrics' | 'queue' | 'related';
  settings: boolean;
  settingsSection: string;
  toasts: Toast[];
  tint: string;
  search: boolean;
  queuePanel: boolean;
  toggleQueuePanel(): void;
  importUrl: string | null;
  openImport(url?: string): void;
  closeImport(): void;
  homeCovers: string[];
  /** Обложка открытой страницы (артист, альбом) — красит фон */
  pageArt: string | null;
  /** Идёт заставка «Волны» — всё приложение чёрное */
  introRunning: boolean;
  /** Меняется при входе/выходе/смене канала — страницы перезагружают данные */
  accountRev: number;
  bumpAccount(): void;
  setIntroRunning(v: boolean): void;
  setPageArt(src: string | null): void;
  /** Окно подтверждения «Добавить в библиотеку» */
  confirm: { title: string; text: string; card: import('../../shared/types').Card; ok: string; resolve: (v: boolean) => void } | null;
  ask(c: { title: string; text: string; card: import('../../shared/types').Card; ok?: string }): Promise<boolean>;
  setHomeCovers(c: string[]): void;
  setSearch(open: boolean): void;
  openMenu(x: number, y: number, items: MenuItem[]): void;
  closeMenu(): void;
  setNowPlaying(open: boolean, tab?: UiState['nowPlayingTab']): void;
  openSettings(section?: string): void;
  closeSettings(): void;
  toast(text: string, kind?: Toast['kind']): void;
  setTint(tint: string): void;
}

export const useUi = create<UiState>((set, get) => ({
  menu: null,
  nowPlaying: false,
  nowPlayingPanelRequested: false,
  nowPlayingTab: 'lyrics',
  settings: false,
  settingsSection: 'play',
  toasts: [],
  tint: '#5B3FD1',
  search: false,
  queuePanel: false,
  toggleQueuePanel: () => set({ queuePanel: !get().queuePanel }),
  importUrl: null,
  openImport: (url) => set({ importUrl: url ?? '', search: false }),
  closeImport: () => set({ importUrl: null }),
  homeCovers: [],
  pageArt: null,
  introRunning: false,
  accountRev: 0,
  bumpAccount: () => (invalidateQueries(), set({ accountRev: get().accountRev + 1 })),
  setIntroRunning: (v) => set({ introRunning: v }),
  setPageArt: (src) => set({ pageArt: src }),
  confirm: null,
  ask: (c) =>
    new Promise<boolean>((resolve) =>
      set({ confirm: { ...c, ok: c.ok ?? 'Подтвердить', resolve: (v) => (set({ confirm: null }), resolve(v)) } })
    ),
  setHomeCovers: (c) => set({ homeCovers: c }),
  setSearch: (open) => set({ search: open, menu: null }),
  openMenu: (x, y, items) => set({ menu: { x, y, items } }),
  closeMenu: () => set({ menu: null }),
  setNowPlaying: (open, tab) => set({ nowPlaying: open, nowPlayingPanelRequested: open && !!tab, ...(tab ? { nowPlayingTab: tab } : {}) }),
  openSettings: (section) => set({ settings: true, settingsSection: section ?? get().settingsSection }),
  closeSettings: () => set({ settings: false }),
  toast: (text, kind = 'info') => {
    const id = uid();
    set({ toasts: [...get().toasts, { id, text, kind }].slice(-3) });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3200);
  },
  setTint: (tint) => set({ tint })
}));
