// Общие типы данных между main-процессом и интерфейсом.

export interface ArtistRef {
  id?: string;
  name: string;
}

export interface AlbumRef {
  id?: string;
  name: string;
}

export interface Track {
  /** videoId в YouTube Music */
  id: string;
  title: string;
  artists: ArtistRef[];
  album?: AlbumRef;
  durationSec?: number;
  thumb?: string;
  explicit?: boolean;
}

export type CardKind = 'track' | 'album' | 'playlist' | 'artist';

export interface Card {
  kind: CardKind;
  id: string;
  title: string;
  subtitle?: string;
  thumb?: string;
  /** Заполнено, если kind === 'track' */
  track?: Track;
  /** Подтверждённый исполнитель (галочка) */
  verified?: boolean;
  /** Альбом/сингл с ненормативной лексикой */
  explicit?: boolean;
}

export interface HomeSection {
  title: string;
  subtitle?: string;
  /** 'grid' — карточки, 'list' — строки треков */
  layout: 'cards' | 'tracks';
  items: Card[];
}

export interface Collection {
  kind: 'album' | 'playlist';
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  author?: string;
  year?: string;
  thumb?: string;
  tracks: Track[];
}

export interface ArtistPage {
  id: string;
  name: string;
  thumb?: string;
  subscribers?: string;
  /** «449 млн слушателей за месяц» — как показывает YouTube Music */
  monthly?: string;
  verified?: boolean;
  description?: string;
  topTracks: Track[];
  sections: HomeSection[];
}

export interface SearchResults {
  query: string;
  top?: Card;
  tracks: Track[];
  albums: Card[];
  artists: Card[];
  playlists: Card[];
}

/** Мгновенные подсказки поиска */
export interface SearchSuggest {
  query: string;
  queries: string[];
  items: Card[];
}

export type SearchFilter = 'all' | 'songs' | 'albums' | 'artists' | 'playlists';

export interface LyricLine {
  /** время начала строки, сек */
  t: number;
  text: string;
}

export interface Lyrics {
  /** Синхронный текст обрывается раньше песни */
  partial?: boolean;
  synced: LyricLine[] | null;
  plain: string | null;
  source: 'lrclib' | 'youtube' | 'betterlyrics' | null;
  /** подпись варианта, например «LRCLIB · 3:41» */
  label?: string;
  /** исходный текст в TTML (слоги) или LRC — для рендера с подсветкой слов */
  ttml?: string;
  lrc?: string;
  /** точность синхронизации */
  sync?: 'syllable' | 'word' | 'line' | 'none';
  /** насколько найденный текст совпадает с треком, 0..1 */
  match?: number;
  /** все найденные варианты текста (включая этот), для переключения */
  alternatives?: Lyrics[];
}

export interface StreamMeta {
  id: string;
  mime: string;
  bitrate: number;
  contentLength: number;
  durationSec: number;
  /** громкость относительно эталона, дБ (для нормализации) */
  loudnessDb: number;
}

export interface DownloadEntry {
  track: Track;
  file: string;
  size: number;
  mime: string;
  at: number;
}

export interface DownloadProgress {
  id: string;
  received: number;
  total: number;
  done: boolean;
  error?: string;
}

export interface YtChannel {
  name: string;
  handle?: string;
  photo?: string;
  pageId?: string;
  selected: boolean;
}

export interface AccountState {
  signedIn: boolean;
  channels: YtChannel[];
  /** YouTube Music отклоняет запросы с этим входом — приложение работает без аккаунта */
  broken?: boolean;
}

export interface ImportResult {
  name: string;
  source: 'youtube' | 'spotify' | 'soundcloud';
  total: number;
  tracks: Track[];
  missing: string[];
}

export interface ImportProgress {
  done: number;
  total: number;
  matched: number;
}

/** Состояние для окна-оверлея с текстом. */
export interface OverlayState {
  track: Track | null;
  lyrics: Lyrics | null;
  position: number;
  playing: boolean;
  offset: number;
  /** момент снятия позиции (Date.now), чтобы оверлей сам «доигрывал» время */
  at: number;
}

export interface OverlayOptions {
  enabled: boolean;
  locked: boolean;
  fontSize: number;
  lines: 1 | 2;
}

export type HotkeyAction = 'playPause' | 'next' | 'prev' | 'like' | 'volumeUp' | 'volumeDown' | 'overlay' | 'showWindow';



export interface DiscordStatus {
  connected: boolean;
  user?: { name: string; avatar?: string };
}

export interface DiagStep {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
}
