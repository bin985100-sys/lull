import { useNavigate } from 'react-router-dom';
import type { Card, Track } from '../../shared/types';
import { api } from '../api';
import { CardRow, ErrorState, RowsSkeleton, Section, SectionView, TrackPanel, cardPath, playCard } from '../components/Cards';
import { Cover } from '../components/Cover';
import { IAlbum, IBookmark, IClock, IFlame, IHeartFill, IPlay, ISparkle, ITrophy, IUsers } from '../components/icons';
import { MonthStats } from '../components/Stats';
import { useEffect, useState } from 'react';
import { MixesRow } from '../components/Mixes';
import { useUi } from '../store/ui';
import { useQuery } from '../lib/useQuery';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';

interface Quick {
  key: string;
  name: string;
  thumb?: string;
  liked?: boolean;
  open(): void;
  play(): void;
}

const sectionIcon = (title: string, i: number) => {
  const t = title.toLowerCase();
  if (/сохран|saved/.test(t)) return <IBookmark size={22} />;
  if (/всё время|все время|all time|самые/.test(t)) return <ITrophy size={22} />;
  if (/слушают|популяр|тренд|чарт|trend|chart/.test(t)) return <IFlame size={22} />;
  if (/исполн|artist/.test(t)) return <IUsers size={22} />;
  if (/для тебя|микс|mix|for you/.test(t)) return <ISparkle size={22} />;
  if (/альбом|album|релиз|release|new/.test(t)) return <IAlbum size={22} />;
  return i === 0 ? <IAlbum size={22} /> : <ISparkle size={22} />;
};

export function Home() {
  const navigate = useNavigate();
  const [chip, setChip] = useState<string | null>(null);
  // После входа в аккаунт ключи меняются — главная перезагружается уже личной
  const rev = useUi((s) => s.accountRev);
  const chips = useQuery(`homeChips:${rev}`, () => api.homeChips());
  const { data, error, loading, reload } = useQuery(chip ? `home:${rev}:${chip}` : `home:${rev}`, () => api.home(chip ?? undefined));
  const charts = useQuery(`charts:${rev}`, () => api.charts());
  const setHomeCovers = useUi((s) => s.setHomeCovers);
  const likes = useLibrary((s) => s.likes);
  const playlists = useLibrary((s) => s.playlists);
  const saved = useLibrary((s) => s.saved);
  const history = useLibrary((s) => s.history);
  const playTracks = usePlayer((s) => s.playTracks);

  const quick: Quick[] = [];
  if (likes.length) quick.push({ key: 'liked', name: 'Любимое', liked: true, open: () => navigate('/liked'), play: () => playTracks(likes.map((l) => l.track), 0, { label: 'Любимое', path: '/liked' }) });
  for (const p of [...playlists].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))) {
    if (quick.length >= 8) break;
    quick.push({ key: p.id, name: p.name, thumb: p.tracks[0]?.track.thumb, open: () => navigate(`/local/${p.id}`), play: () => playTracks(p.tracks.map((x) => x.track), 0, { label: p.name, path: `/local/${p.id}` }) });
  }
  for (const s of saved) {
    if (quick.length >= 8) break;
    const c: Card = s.card;
    quick.push({ key: c.id, name: c.title, thumb: c.thumb, open: () => navigate(cardPath(c)), play: () => void playCard(c) });
  }
  const recent: Track[] = history.slice(0, 10).map((h) => h.track);

  // Первая подборка из карточек идёт крупным рядом, первая подборка треков — панелью
  const sections = data ?? [];
  const firstCards = sections.findIndex((s) => s.layout === 'cards');
  const firstTracks = sections.findIndex((s) => s.layout === 'tracks');
  const rest = sections.filter((_, i) => i !== firstCards && i !== firstTracks);
  const chartTracks = charts.data?.find((s) => s.layout === 'tracks');
  const chartCards = charts.data?.find((s) => s.layout === 'cards');

  // Обложки для живого фона главной
  useEffect(() => {
    const covers = [...(sections[firstCards]?.items ?? []), ...(chartCards?.items ?? [])].map((c) => c.thumb).filter(Boolean) as string[];
    setHomeCovers(covers);
  }, [data, charts.data, firstCards, setHomeCovers]);

  const mixFallback = (chartTracks?.items ?? []).map((c) => c.track).filter(Boolean) as Track[];
  const chipRow = (chips.data?.length ?? 0) > 0 && (
    <div className="home-chips" role="tablist" aria-label="Категории">
      {chips.data!.map((c) => (
        <button key={c} type="button" role="tab" aria-selected={chip === c} className={`chip ${chip === c ? 'on' : ''}`} onClick={() => setChip(chip === c ? null : c)}>{c}</button>
      ))}
    </div>
  );

  // Выбрана категория — только её подборки, как в YouTube Music
  if (chip)
    return (
      <div className="page home-page" style={{ gap: 40 }}>
        {chipRow}
        {loading && !data && <RowsSkeleton count={6} />}
        {error && !data && <ErrorState text={error} onRetry={reload} />}
        {sections.map((s, i) => <SectionView key={s.title + i} section={s} icon={sectionIcon(s.title, i)} />)}
      </div>
    );

  return (
    <div className="page home-page" style={{ gap: 44 }}>
      {chipRow}
      <MixesRow fallback={mixFallback} />
      {loading && !data && (
        <section className="section">
          <span className="skel" style={{ height: 30, width: 220 }} />
          <div className="hrow">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="card"><span className="skel" style={{ aspectRatio: '1', borderRadius: 14 }} /><span className="skel" style={{ height: 14, width: '60%' }} /></div>
            ))}
          </div>
          <RowsSkeleton count={5} />
        </section>
      )}
      {error && !data && <ErrorState text={error} onRetry={reload} />}

      {firstCards >= 0 && <CardRow title={sections[firstCards].title} subtitle={sections[firstCards].subtitle} icon={<IAlbum size={22} />} cards={sections[firstCards].items} />}
      {chartTracks ? (
        <TrackPanel title="Сейчас слушают" icon={<IFlame size={22} />} tracks={chartTracks.items.map((c) => c.track).filter(Boolean).slice(0, 10) as Track[]} source={{ label: "Сейчас слушают" }} />
      ) : (
        firstTracks >= 0 && <SectionView section={sections[firstTracks]} />
      )}

      <MonthStats icon={<ISparkle size={22} />} />

      {recent.length > 0 && <TrackPanel title="Продолжить прослушивание" icon={<IClock size={22} />} tracks={recent} />}

      {quick.length > 0 && (
        <Section title="Быстрый доступ" icon={<IHeartFill size={21} />}>
          <div className="quick">
            {quick.map((q) => (
              <div key={q.key} className="quick-tile" role="link" tabIndex={0} onClick={q.open} onKeyDown={(e) => e.key === 'Enter' && q.open()} style={{ cursor: 'pointer' }}>
                {q.liked ? (
                  <span style={{ width: 64, height: 64, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, var(--tint), #1B1440)' }}><IHeartFill size={26} /></span>
                ) : (
                  <Cover src={q.thumb} size={64} radius={0} />
                )}
                <span className="name ell">{q.name}</span>
                <button type="button" className="play-btn pb" aria-label={`Слушать «${q.name}»`} onClick={(e) => (e.stopPropagation(), q.play())}><IPlay size={15} /></button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {chartTracks && firstTracks >= 0 && <SectionView section={sections[firstTracks]} />}
      {chartCards && <CardRow title={chartCards.title} icon={<IAlbum size={22} />} cards={chartCards.items} />}
      {rest.map((s, i) => <SectionView key={s.title + i} section={s} icon={sectionIcon(s.title, i + 1)} />)}
    </div>
  );
}
