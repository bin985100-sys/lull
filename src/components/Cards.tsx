import { memo, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Card, HomeSection, Track } from '../../shared/types';
import { api } from '../api';
import { cardMenu, openMenuAt } from '../lib/trackMenu';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';
import { Cover } from './Cover';
import { IChevronLeft, IChevronRight, IFlame, IPlay, IVerified } from './icons';
import { TrackRow } from './Tracks';

export function cardPath(c: Card): string {
  return c.kind === 'album' ? `/album/${c.id}` : c.kind === 'playlist' ? `/playlist/${c.id}` : c.kind === 'artist' ? `/artist/${c.id}` : '';
}

/** Загрузить треки карточки и начать воспроизведение. */
export async function playCard(c: Card) {
  const player = usePlayer.getState();
  try {
    if (c.kind === 'track' && c.track) return player.playTrack(c.track);
    if (c.kind === 'album') {
      const a = await api.album(c.id);
      return player.playTracks(a.tracks, 0, { label: a.title, path: `/album/${c.id}` });
    }
    if (c.kind === 'playlist') {
      const p = await api.playlist(c.id);
      return player.playTracks(p.tracks, 0, { label: p.title, path: `/playlist/${c.id}` });
    }
    if (c.kind === 'artist') {
      const a = await api.artist(c.id);
      return player.playTracks(a.topTracks, 0, { label: a.name, path: `/artist/${c.id}` });
    }
  } catch {
    useUi.getState().toast('Не удалось загрузить', 'error');
  }
}

export const MediaCard = memo(function MediaCard({ card }: { card: Card }) {
  const navigate = useNavigate();
  const open = () => (card.kind === 'track' ? void playCard(card) : navigate(cardPath(card)));
  return (
    <div
      className={`card ${card.kind === 'artist' ? 'artist' : ''}`}
      role="link"
      tabIndex={0}
      aria-label={card.title}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open()}
      onContextMenu={(e: MouseEvent) => openMenuAt(e, cardMenu(card, navigate))}
      style={{ cursor: 'pointer' }}
    >
      {card.thumb && <img className={`card-glow ${card.kind === 'artist' ? 'round' : ''}`} src={api.imageUrl(card.thumb)} alt="" aria-hidden="true" loading="lazy" draggable={false} />}
      <span className="cv">
        <Cover src={card.thumb} round={card.kind === 'artist'} radius={16} />
        <button type="button" className="play-btn fab" aria-label={`Слушать «${card.title}»`} onClick={(e) => (e.stopPropagation(), void playCard(card))}>
          <IPlay size={18} />
        </button>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '0 2px' }}>
        <span className="t ell">{card.title}{card.verified && <IVerified size={15} className="vbadge" aria-label="Подтверждённый исполнитель" />}</span>
        {(card.subtitle || card.explicit) && <span className="s ell">{card.explicit && <span className="ebadge" title="Ненормативная лексика">E</span>}{card.subtitle?.replace(/\s*[•·]\s*/g, ' · ')}</span>}
      </span>
    </div>
  );
});

export function Section({ title, subtitle, action, icon, children }: { title: string; subtitle?: string; action?: ReactNode; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2 className="h2">{icon}{title}</h2>
          {subtitle && <div className="sub">{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Горизонтальный ряд карточек со стрелками прокрутки. */
export function CardRow({ title, subtitle, icon, cards }: { title: string; subtitle?: string; icon?: ReactNode; cards: Card[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * (ref.current.clientWidth - 120), behavior: 'smooth' });
  // затухание справа только когда дальше есть карточки
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const upd = () => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    upd();
    el.addEventListener('scroll', upd, { passive: true });
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', upd); ro.disconnect(); };
  }, [cards.length]);
  return (
    <Section
      title={title}
      subtitle={subtitle}
      icon={icon}
      action={
        cards.length > 4 ? (
          <div className="hrow-nav">
            <button type="button" className="ic ic-36 filled round" aria-label="Прокрутить назад" onClick={() => scroll(-1)}><IChevronLeft size={16} /></button>
            <button type="button" className="ic ic-36 filled round" aria-label="Прокрутить вперёд" onClick={() => scroll(1)}><IChevronRight size={16} /></button>
          </div>
        ) : undefined
      }
    >
      <div className="hrow-wrap">
        <div ref={ref} className={`hrow ${more ? 'more' : ''}`}>
          {cards.map((c) => <MediaCard key={c.kind + c.id} card={c} />)}
        </div>
      </div>
    </Section>
  );
}

/** Треки в тёмной панели в две колонки. */
export function TrackPanel({ title, icon, tracks, source }: { title: string; icon?: ReactNode; tracks: Track[]; source?: { label: string } }) {
  return (
    <Section title={title} icon={icon}>
      <div className="tracks-panel">
        <div className="tracks-2col">
          {tracks.map((t, i) => <TrackRow key={t.id + i} list={tracks} index={i} source={source ?? { label: title }} />)}
        </div>
      </div>
    </Section>
  );
}

export function SectionView({ section, icon }: { section: HomeSection; icon?: ReactNode }) {
  if (section.layout === 'tracks') {
    const tracks = section.items.map((c) => c.track).filter(Boolean) as Track[];
    return <TrackPanel title={section.title} icon={icon ?? <IFlame size={22} />} tracks={tracks.slice(0, 10)} />;
  }
  return <CardRow title={section.title} subtitle={section.subtitle} icon={icon} cards={section.items} />;
}

export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card">
          <span className="skel" style={{ aspectRatio: '1', borderRadius: 16 }} />
          <span className="skel" style={{ height: 14, width: '70%' }} />
          <span className="skel" style={{ height: 12, width: '50%' }} />
        </div>
      ))}
    </div>
  );
}

export function RowsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '0 10px' }}>
          <span className="skel" style={{ width: 48, height: 48 }} />
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="skel" style={{ height: 13, width: '40%' }} />
            <span className="skel" style={{ height: 11, width: '25%' }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="empty">
      <b>Не получилось загрузить</b>
      <span>{text}</span>
      {onRetry && <button type="button" className="btn" onClick={onRetry}>Повторить</button>}
    </div>
  );
}
