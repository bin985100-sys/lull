import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Track } from '../../shared/types';
import { api } from '../api';
import { buildMixes, mixSubtitle, mixTracks, rememberMixes, type Mix } from '../lib/mixes';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { Section } from './Cards';
import { IPlay, IWaveNav } from './icons';

/** Обложка микса: фото исполнителя, затемнение и крупная подпись нашим широким шрифтом. */
export function MixCover({ mix, size }: { mix: Mix; size?: number | string }) {
  return (
    <span className="mix-cover" style={{ width: size, height: size }}>
      {mix.cover && <img src={api.imageUrl(mix.cover)} alt="" loading="lazy" draggable={false} />}
      <span className="mix-shade" />
      <span className="mix-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="100%" height="100%"><circle cx="12" cy="12" r="10" fill="#fff" /><path d="M10 8.2v7.6l6-3.8z" fill="#111" /></svg>
      </span>
      <span className="mix-label">
        <span>Микс</span>
        <b>{mix.n}</b>
      </span>
    </span>
  );
}

function MixCard({ mix }: { mix: Mix }) {
  const navigate = useNavigate();
  const playTracks = usePlayer((s) => s.playTracks);
  const [tracks, setTracks] = useState<Track[] | undefined>();
  useEffect(() => {
    let alive = true;
    void mixTracks(mix).then((t) => alive && setTracks(t));
    return () => {
      alive = false;
    };
  }, [mix]);
  const open = () => navigate(`/mix/${mix.n}`);
  return (
    <motion.div className="card mix-card" role="link" tabIndex={0} aria-label={mix.title} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()} whileHover={{ y: -3 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }} style={{ cursor: 'pointer' }}>
      {mix.cover && <img className="card-glow" src={api.imageUrl(mix.cover)} alt="" aria-hidden="true" loading="lazy" draggable={false} />}
      <span className="cv">
        <MixCover mix={mix} />
        <button type="button" className="play-btn fab" aria-label={`Слушать «${mix.title}»`} onClick={(e) => (e.stopPropagation(), void mixTracks(mix).then((t) => playTracks(t, 0, { label: mix.title, path: `/mix/${mix.n}` })))}>
          <IPlay size={18} />
        </button>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '0 2px' }}>
        <span className="t ell">{mix.title}</span>
        <span className="s ell">{mixSubtitle(mix, tracks)}</span>
      </span>
    </motion.div>
  );
}

/** «Ваши миксы» на главной. */
export function MixesRow({ fallback }: { fallback: Track[] }) {
  const history = useLibrary((s) => s.history.length);
  const [mixes, setMixes] = useState<Mix[]>([]);
  useEffect(() => {
    const m = buildMixes(fallback);
    rememberMixes(m);
    setMixes(m);
    // пересчитываем, когда меняется история, но не на каждый трек
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(history / 10), fallback.length]);
  if (!mixes.length) return null;
  return (
    <Section title="Ваши миксы" icon={<span className="mix-ico" aria-hidden="true"><IWaveNav size={18} /></span>}>
      <div className="hrow-wrap">
        <div className="hrow">{mixes.map((m) => <MixCard key={m.n + m.seed.id} mix={m} />)}</div>
      </div>
    </Section>
  );
}
