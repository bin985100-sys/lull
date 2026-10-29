import { memo, useState, type CSSProperties } from 'react';
import { api } from '../api';
import { IMusic } from './icons';

// Share the same CORS cache entry as the canvas palette/texture readers.
const imageOrigin = (src: string) => api.imageUrl(src).includes('/api/img?') ? 'anonymous' as const : undefined;

interface Props {
  src?: string;
  size?: number | string;
  radius?: number | string;
  round?: boolean;
  className?: string;
  style?: CSSProperties;
  eager?: boolean;
  /** Мягкое свечение вокруг обложки её же цветами */
  glow?: boolean;
}

/** Обложка с плавным появлением и заглушкой. Картинки идут через media://img (кеш + CORS). */
export const Cover = memo(function Cover({ src, size = '100%', radius = 12, round, className, style, eager, glow }: Props) {
  const [loadedSrc, setLoadedSrc] = useState<string>();
  const [failedSrc, setFailedSrc] = useState<string>();
  const ready = !!src && loadedSrc === src;
  const failed = !!src && failedSrc === src;
  const s = typeof size === 'number' ? `${size}px` : size;
  if (glow && src && !failed)
    return (
      <span className={`cover-glow ${ready ? 'ready' : ''}`} style={{ width: s, height: s, borderRadius: round ? '50%' : radius, ...style }}>
        {/* Размытая копия обложки под ней — свечение точно в её цветах */}
        <img className="cover-glow-img" src={api.imageUrl(src)} crossOrigin={imageOrigin(src)} alt="" aria-hidden="true" draggable={false} loading={eager ? 'eager' : 'lazy'} onLoad={() => setLoadedSrc(src)} onError={() => setFailedSrc(src)} style={{ borderRadius: round ? '50%' : radius, filter: `blur(${typeof size === 'number' ? Math.max(8, Math.round(size * 0.28)) : 24}px) saturate(1.7) brightness(1.1)` }} />
        <Cover src={src} size="100%" radius={radius} round={round} className={className} eager={eager} />
              </span>
    );
  return (
    <span className={`cover-box ${className ?? ''}`} style={{ width: s, height: s, borderRadius: round ? '50%' : radius, display: 'block', ...style }}>
      {(!src || failed) && (
        <span className="ph">
          <IMusic size={typeof size === 'number' ? Math.max(14, size / 3) : 32} />
        </span>
      )}
      {src && !ready && !failed && loadedSrc && (
        <img key={`previous:${loadedSrc}`} className="cover ready" style={{ position: 'absolute', inset: 0 }} src={api.imageUrl(loadedSrc)} crossOrigin={imageOrigin(loadedSrc)} alt="" aria-hidden="true" draggable={false} />
      )}
      {src && !failed && (
        <img
          key={`current:${src}`}
          className={`cover ${ready ? 'ready' : ''}`}
          src={api.imageUrl(src)}
          crossOrigin={imageOrigin(src)}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
        />
      )}
    </span>
  );
});
