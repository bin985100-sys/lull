import { create } from 'zustand';
import type { HotkeyAction, OverlayOptions } from '../../shared/types';
import { api } from '../api';

export const EQ_PRESETS: Record<string, { label: string; gains: number[] }> = {
  flat: { label: 'Ровно', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  bass: { label: 'Больше баса', gains: [6, 5, 4, 2, 0, 0, 0, 0, 1, 2] },
  vocal: { label: 'Вокал', gains: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1] },
  night: { label: 'Ночной', gains: [3, 2, 1, 0, -1, -2, -2, -1, 0, 0] },
  bright: { label: 'Яркий', gains: [0, 0, 0, 0, 1, 2, 3, 4, 5, 5] }
};

export interface Settings {
  autoplay: boolean;
  gapless: boolean;
  crossfade: number;
  quality: 'auto' | 'high' | 'low' | 'opus' | 'aac';
  outputDeviceId: string;
  pauseOnDeviceChange: boolean;
  normalize: boolean;
  eqEnabled: boolean;
  eqPreset: string;
  eqGains: number[];
  background: 'cover' | 'gradient' | 'blur' | 'mono' | 'black';
  speed: number;
  pitch: number;
  animatedBg: boolean;
  doubleClick: 'play' | 'queue';
  restoreQueue: boolean;
  discordRpc: boolean;
  /** Сервер Lull: строка подключения lull://КЛЮЧ@АДРЕС:ПОРТ#ОТПЕЧАТОК и включён ли он */
  relay: string;
  relayOn: boolean;
  discordClientId: string;
  /** Звуки интерфейса (заставка «Волны») */
  uiSounds: boolean;
  /** Заставка при входе в «Волну» */
  waveIntro: boolean;
  /** Заставку уже показали (показываем один раз) */
  waveIntroSeen: boolean;
  /** Волну уже запускали кнопкой — дальше она стартует сама при входе */
  waveStarted: boolean;
  /** Стартовая библиотека уже собрана */
  starterSeeded: boolean;
  lang: string;
  overlay: OverlayOptions;
  hotkeys: Partial<Record<HotkeyAction, string>>;
}

export const defaultSettings: Settings = {
  autoplay: true,
  gapless: true,
  crossfade: 0,
  quality: 'auto',
  outputDeviceId: '',
  pauseOnDeviceChange: true,
  normalize: true,
  eqEnabled: false,
  eqPreset: 'flat',
  eqGains: EQ_PRESETS.flat.gains,
  background: 'cover',
  speed: 1,
  pitch: 0,
  animatedBg: true,
  doubleClick: 'play',
  restoreQueue: true,
  discordRpc: false,
  relay: '',
  relayOn: true,
  discordClientId: '',
  uiSounds: true,
  waveIntro: true,
  waveIntroSeen: false,
  waveStarted: false,
  starterSeeded: false,
  lang: 'ru',
  overlay: { enabled: false, locked: true, fontSize: 34, lines: 2 },
  hotkeys: {
    playPause: 'Ctrl+Alt+P',
    next: 'Ctrl+Alt+Right',
    prev: 'Ctrl+Alt+Left',
    like: 'Ctrl+Alt+L',
    volumeUp: 'Ctrl+Alt+Up',
    volumeDown: 'Ctrl+Alt+Down',
    overlay: 'Ctrl+Alt+O',
    showWindow: 'Ctrl+Alt+M'
  }
};

interface SettingsState extends Settings {
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  patch(p: Partial<Settings>): void;
  hydrate(): Promise<void>;
}

const pick = (s: SettingsState): Settings => {
  const out = {} as Record<string, unknown>;
  for (const k of Object.keys(defaultSettings)) out[k] = s[k as keyof Settings];
  return out as unknown as Settings;
};

export const useSettings = create<SettingsState>((set, get) => ({
  ...defaultSettings,
  set: (key, value) => {
    set({ [key]: value } as Partial<SettingsState>);
    void api.storeSet('settings', pick(get()));
  },
  patch: (p) => {
    set(p);
    void api.storeSet('settings', pick(get()));
  },
  hydrate: async () => {
    const saved = await api.storeGet<Partial<Settings>>('settings');
    if (saved) set({ ...defaultSettings, ...saved });
  }
}));
