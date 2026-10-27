import type {
  DiagStep,
  SearchSuggest,
  AccountState,
  HotkeyAction,
  ImportProgress,
  ImportResult,
  OverlayOptions,
  OverlayState,
  ArtistPage,
  Collection,
  DownloadEntry,
  DownloadProgress,
  HomeSection,
  Lyrics,
  SearchFilter,
  SearchResults,
  StreamMeta,
  Track
} from './types';

/** Контракт между preload (window.api) и интерфейсом. */
export interface Api {
  accountStorage?: { get(key: string): Promise<string | null>; set(key: string, value: string | null): Promise<void> };
  accountCallback?(): Promise<string | null>;
  onAccountCallback?(cb: (url: string) => void): () => void;
  platform: string;

  // каталог
  home(chip?: string): Promise<HomeSection[]>;
  homeChips(): Promise<string[]>;
  charts(): Promise<HomeSection[]>;
  search(query: string, filter?: SearchFilter): Promise<SearchResults>;
  suggest(query: string): Promise<string[]>;
  suggestRich(query: string): Promise<SearchSuggest>;
  album(id: string): Promise<Collection>;
  playlist(id: string): Promise<Collection>;
  artist(id: string): Promise<ArtistPage>;
  upNext(videoId: string): Promise<Track[]>;
  lyrics(track: Track): Promise<Lyrics>;

  // воспроизведение
  streamUrl(id: string): string;
  imageUrl(src: string): string;
  /** prefetch — заранее, в очереди по одному (не мешает текущему треку) */
  prepareStream(id: string, prefetch?: boolean, hint?: { title: string; artist: string; duration?: number }): Promise<StreamMeta>;
  /** Проверка сервера Lull (raw — строка подключения до сохранения). */
  relayHealth(raw?: string): Promise<{ ok: boolean; ms: number; detail: string }>;

  // хранилище ключ-значение (библиотека, настройки, очередь)
  storeGet<T>(key: string): Promise<T | undefined>;
  storeSet(key: string, value: unknown): Promise<void>;

  // загрузки
  download(track: Track): Promise<DownloadEntry>;
  removeDownload(id: string): Promise<void>;
  listDownloads(): Promise<Record<string, DownloadEntry>>;
  onDownloadProgress(cb: (p: DownloadProgress) => void): () => void;

  // окно
  windowMinimize(): void;
  windowToggleMaximize(): void;
  windowClose(): void;
  onMaximizedChange(cb: (maximized: boolean) => void): () => void;

  // PO-токен (BotGuard выполняется в рендерере, сеть — через main)
  visitorData(): Promise<string>;
  setPoToken(token: string, visitorData: string): Promise<void>;
  netFetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; text: string }>;

  // аккаунт YouTube Music
  ytLogin(): Promise<boolean>;
  ytLogout(): Promise<void>;
  ytAccount(): Promise<AccountState>;
  ytSelectChannel(pageId: string | null): Promise<void>;
  ytLibrary(): Promise<{ playlists: import('./types').Card[]; liked: Track[] }>;

  // Discord
  discordStatus(): Promise<import('./types').DiscordStatus>;

  // импорт плейлистов по ссылке
  importPlaylist(url: string): Promise<ImportResult>;
  onImportProgress(cb: (p: ImportProgress) => void): () => void;

  // оверлей с текстом
  overlayConfigure(o: OverlayOptions): Promise<void>;
  overlayPush(s: OverlayState): void;
  onOverlayState(cb: (s: OverlayState) => void): () => void;
  onOverlayOptions(cb: (o: OverlayOptions) => void): () => void;

  // глобальные горячие клавиши (работают, даже когда окно свёрнуто)
  setHotkeys(map: Partial<Record<HotkeyAction, string>>): Promise<Partial<Record<HotkeyAction, boolean>>>;
  onHotkey(cb: (a: HotkeyAction) => void): () => void;

  // интеграции и приложение
  discordActivity(payload: { track: Track; positionSec: number; playing: boolean } | null): Promise<void>;
  discordConfigure(enabled: boolean, clientId: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  cacheInfo(): Promise<{ bytes: number; downloadsBytes: number }>;
  clearCache(): Promise<void>;
  appVersion(): Promise<string>;


  /** Проверить воспроизведение трека всеми способами */
  diagnose(track: Track): Promise<DiagStep[]>;
  /** Открыть папку с журналом */
  openLogs(): Promise<void>;
}

export const IPC = {
  accountStorageGet: 'account:storage:get',
  accountStorageSet: 'account:storage:set',
  accountCallback: 'account:callback:get',
  accountCallbackEvent: 'account:callback',
  home: 'yt:home',
  homeChips: 'yt:home-chips',
  charts: 'yt:charts',
  search: 'yt:search',
  suggest: 'yt:suggest',
  suggestRich: 'yt:suggestRich',
  album: 'yt:album',
  playlist: 'yt:playlist',
  artist: 'yt:artist',
  upNext: 'yt:upnext',
  lyrics: 'yt:lyrics',
  prepareStream: 'yt:prepare',
  relayHealth: 'relay:health',
  visitorData: 'yt:visitor',
  setPoToken: 'yt:potoken',
  netFetch: 'net:fetch',
  storeGet: 'store:get',
  storeSet: 'store:set',
  download: 'dl:start',
  removeDownload: 'dl:remove',
  listDownloads: 'dl:list',
  downloadProgress: 'dl:progress',
  winMinimize: 'win:min',
  winMaximize: 'win:max',
  winClose: 'win:close',
  winMaximized: 'win:maximized',
  discordActivity: 'discord:activity',
  discordConfigure: 'discord:configure',
  openExternal: 'app:open',
  cacheInfo: 'app:cache',
  clearCache: 'app:clearcache',
  appVersion: 'app:version',
  diagnose: 'app:diagnose',
  openLogs: 'app:logs',
  ytLogin: 'yt:login',
  ytLogout: 'yt:logout',
  ytAccount: 'yt:account',
  ytSelectChannel: 'yt:channel',
  ytLibrary: 'yt:library',
  discordStatus: 'discord:status',
  importPlaylist: 'import:start',
  importProgress: 'import:progress',
  overlayConfigure: 'overlay:configure',
  overlayPush: 'overlay:push',
  overlayState: 'overlay:state',
  overlayOptions: 'overlay:options',
  setHotkeys: 'hotkeys:set',
  hotkey: 'hotkeys:fire'
} as const;
