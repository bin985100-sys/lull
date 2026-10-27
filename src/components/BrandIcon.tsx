import { siDiscord, siSoundcloud, siSpotify, siYoutube, siYoutubemusic } from 'simple-icons';

/** Сервисы, у которых есть фирменный значок. */
export type Brand = 'spotify' | 'youtube' | 'ytmusic' | 'soundcloud' | 'discord';

interface Look {
  path: string;
  /** Фон плитки — как у иконки приложения сервиса */
  bg: string;
  /** Цвет знака */
  fg: string;
  /** Доля размера плитки, которую занимает знак */
  scale: number;
}

const LOOKS: Record<Brand, Look> = {
  spotify: { path: siSpotify.path, bg: '#121212', fg: '#1ED760', scale: 0.62 },
  youtube: { path: siYoutube.path, bg: '#fff', fg: '#FF0000', scale: 0.62 },
  ytmusic: { path: siYoutubemusic.path, bg: '#0F0F0F', fg: '#FF0033', scale: 0.64 },
  soundcloud: { path: siSoundcloud.path, bg: 'linear-gradient(180deg, #FF7A00 0%, #FF3300 100%)', fg: '#fff', scale: 0.66 },
  discord: { path: siDiscord.path, bg: '#5865F2', fg: '#fff', scale: 0.58 }
};

export const BRAND_NAME: Record<Brand, string> = {
  spotify: 'Spotify',
  youtube: 'YouTube',
  ytmusic: 'YouTube Music',
  soundcloud: 'SoundCloud',
  discord: 'Discord'
};

/** Фирменный знак сервиса в скруглённом квадрате — как иконка приложения. */
export function BrandIcon({ brand, size = 28, radius }: { brand: Brand; size?: number; radius?: number }) {
  const l = LOOKS[brand];
  const glyph = Math.round(size * l.scale);
  return (
    <span
      className="brand-tile"
      role="img"
      aria-label={BRAND_NAME[brand]}
      style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.26), background: l.bg }}
    >
      <svg viewBox="0 0 24 24" width={glyph} height={glyph} fill={l.fg} aria-hidden="true">
        <path d={l.path} />
      </svg>
    </span>
  );
}
