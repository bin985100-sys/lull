import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Card } from '../../shared/types';
import { api } from '../api';
import { ErrorState, RowsSkeleton, Section, SectionView } from '../components/Cards';
import { Cover } from '../components/Cover';
import { IExternal, ILibraryAdd, ILibraryDone, IMoreH, IPlay, IShare, IShuffle, IVerified, IWave } from '../components/icons';
import { TrackRow } from '../components/Tracks';
import { listPrefetch } from '../lib/prefetch';
import { confirmSave, share, usePageArt, ytMusicUrl } from '../lib/share';
import { openMenuAt } from '../lib/trackMenu';
import { useQuery } from '../lib/useQuery';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';

export function ArtistScreen() {
  const { id = '' } = useParams();
  const { data, error, loading, reload } = useQuery(`artist:${id}`, () => api.artist(id));
  const playTracks = usePlayer((s) => s.playTracks);
  const startRadio = usePlayer((s) => s.startRadio);
  const saved = useLibrary((s) => s.saved.some((x) => x.card.id === id));
  const toggleSaved = useLibrary((s) => s.toggleSaved);
  const [all, setAll] = useState(false);
  usePageArt(data?.thumb);
  // Популярные треки готовим заранее — чаще всего включают их
  useEffect(() => (data ? listPrefetch(data.topTracks, 3) : undefined), [data]);

  if (loading && !data)
    return (
      <div className="page">
        <div style={{ display: 'flex', gap: 30, alignItems: 'center' }}>
          <span className="skel" style={{ width: 200, height: 200, borderRadius: '50%' }} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}><span className="skel" style={{ height: 40, width: 280 }} /><span className="skel" style={{ height: 18, width: 200 }} /></span>
        </div>
        <RowsSkeleton />
      </div>
    );
  if (error && !data) return <ErrorState text={error} onRetry={reload} />;
  if (!data) return null;

  const card: Card = { kind: 'artist', id, title: data.name, subtitle: 'Исполнитель', thumb: data.thumb, verified: data.verified };
  const top = all ? data.topTracks : data.topTracks.slice(0, 5);
  const src = { label: data.name, path: `/artist/${id}` };
  const shuffleAll = () => {
    if (!data.topTracks.length) return;
    if (!usePlayer.getState().shuffle) usePlayer.getState().toggleShuffle();
    playTracks(data.topTracks, Math.floor(Math.random() * data.topTracks.length), src);
  };

  return (
    <div className="page artist-page">
      <header className="artist-head">
        <motion.span className="artist-ava" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}>
          <Cover src={data.thumb} size={200} round eager />
        </motion.span>
        <div className="artist-meta">
          <h1 className="artist-name">
            <span className="ell">{data.name}</span>
            {data.verified && <IVerified size={28} aria-label="Подтверждённый исполнитель" />}
          </h1>
          {(data.monthly || data.subscribers) && <span className="artist-sub">{data.monthly ?? data.subscribers}</span>}
          <div className="artist-btns">
            <button type="button" className="btn light artist-play" disabled={!data.topTracks.length} onClick={() => playTracks(data.topTracks, 0, src)}>
              <IPlay size={17} />Играть
            </button>
            <button type="button" className="btn sq" aria-label="Перемешать" title="Перемешать" disabled={!data.topTracks.length} onClick={shuffleAll}><IShuffle size={19} /></button>
            <button type="button" className={`btn sq ${saved ? 'on' : ''}`} aria-label={saved ? 'Убрать из библиотеки' : 'Добавить в библиотеку'} title={saved ? 'В библиотеке' : 'Добавить в библиотеку'} aria-pressed={saved} onClick={() => void confirmSave(card, saved, toggleSaved)}>
              {saved ? <ILibraryDone size={19} /> : <ILibraryAdd size={19} />}
            </button>
            <button type="button" className="btn sq" aria-label="Поделиться" title="Скопировать ссылку" onClick={() => void share('artist', id, data.name)}><IShare size={19} /></button>
            <button
              type="button"
              className="btn sq"
              aria-label="Ещё"
              onClick={(e) =>
                openMenuAt(e, [
                  ...(data.topTracks[0] ? [{ label: 'Волна исполнителя', icon: <IWave size={17} />, onClick: () => void startRadio(data.topTracks[0]) }] : []),
                  { label: 'Открыть в YouTube Music', icon: <IExternal size={17} />, onClick: () => void api.openExternal(ytMusicUrl('artist', id)) }
                ])
              }
            >
              <IMoreH size={18} />
            </button>
          </div>
        </div>
      </header>

      {data.topTracks.length > 0 && (
        <Section title="Популярные" action={data.topTracks.length > 5 ? <button type="button" className="link-btn" onClick={() => setAll(!all)}>{all ? 'Свернуть' : 'Показать все'}</button> : undefined}>
          <div className="artist-top">
            {top.map((t, i) => <TrackRow key={t.id} list={data.topTracks} index={i} source={src} />)}
          </div>
        </Section>
      )}
      {data.sections.map((s, i) => <SectionView key={s.title + i} section={s} />)}
      {data.description && (
        <Section title="Об исполнителе">
          <p className="muted" style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 820, whiteSpace: 'pre-line', userSelect: 'text' }}>{data.description}</p>
        </Section>
      )}
    </div>
  );
}
