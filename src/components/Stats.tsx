import { animate, motion } from 'framer-motion';
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Track } from '../../shared/types';
import { plural } from '../lib/format';
import { openMenuAt, trackMenu } from '../lib/trackMenu';
import { monthKey, useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { Cover } from './Cover';
import { IPlay } from './icons';
import { Section } from './Cards';

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const c = animate(0, value, { duration: 1.2, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => (el.textContent = Math.round(v).toLocaleString('ru-RU') + suffix) });
    return () => c.stop();
  }, [value, suffix]);
  return <span ref={ref}>0{suffix}</span>;
}

export function MonthStats({ icon }: { icon?: React.ReactNode }) {
  const navigate = useNavigate();
  const stats = useLibrary((s) => s.stats[monthKey()]);
  const playTracks = usePlayer((s) => s.playTracks);
  const now = new Date();
  const title = `Твой ${MONTHS[now.getMonth()]}`;

  const data = useMemo(() => {
    if (!stats) return null;
    const plays = Object.values(stats.plays);
    const topTracks = [...plays].sort((a, b) => b.count - a.count || b.sec - a.sec).filter((p) => p.count > 0 || p.sec > 30).slice(0, 5);
    const artists = new Map<string, { name: string; id?: string; sec: number; count: number; thumb?: string }>();
    for (const p of plays) {
      const a = p.track.artists[0];
      if (!a) continue;
      const cur = artists.get(a.name) ?? { name: a.name, id: a.id, sec: 0, count: 0, thumb: p.track.thumb };
      cur.sec += p.sec;
      cur.count += p.count;
      artists.set(a.name, cur);
    }
    const topArtists = [...artists.values()].sort((a, b) => b.sec - a.sec).slice(0, 4);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const key = `${monthKey()}-${String(i + 1).padStart(2, '0')}`;
      return stats.days[key] ?? 0;
    });
    let streak = 0;
    for (let i = now.getDate() - 1; i >= 0 && days[i] > 0; i--) streak++;
    return { minutes: Math.round(stats.sec / 60), tracks: plays.filter((p) => p.count > 0).length, artists: artists.size, topTracks, topArtists, days, streak, maxDay: Math.max(1, ...days) };
  }, [stats]);

  if (!data || data.minutes < 1)
    return (
      <Section title={title} icon={icon}>
        <div className="stat-empty">Слушай музыку — здесь появится статистика месяца: минуты, любимые треки и исполнители.</div>
      </Section>
    );

  const tracks: Track[] = data.topTracks.map((p) => p.track);
  return (
    <Section title={title} icon={icon} subtitle="Статистика прослушиваний в этом приложении">
      <div className="stats-grid">
        {[
          [data.minutes, plural(data.minutes, ['минута', 'минуты', 'минут'])],
          [data.tracks, plural(data.tracks, ['трек', 'трека', 'треков'])],
          [data.artists, plural(data.artists, ['исполнитель', 'исполнителя', 'исполнителей'])],
          [data.streak, `${plural(data.streak, ['день', 'дня', 'дней'])} подряд`]
        ].map(([v, l], i) => (
          <motion.div key={i} className="stat-tile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.4 }}>
            <b><CountUp value={v as number} /></b>
            <span>{l}</span>
          </motion.div>
        ))}
        <div className="stat-tile stat-chart" aria-label="Активность по дням месяца">
          <div className="bars">
            {data.days.map((d, i) => (
              <motion.span key={i} title={`${i + 1}: ${Math.round(d / 60)} мин`} className={i === now.getDate() - 1 ? 'today' : ''} initial={{ scaleY: 0 }} animate={{ scaleY: Math.max(0.04, d / data.maxDay) }} transition={{ delay: 0.2 + i * 0.012, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }} />
            ))}
          </div>
          <span>Активность по дням</span>
        </div>
      </div>

      <div className="stats-cols">
        <div className="tracks-panel">
          <div className="stat-head">Топ треков месяца</div>
          {data.topTracks.map((p, i) => (
            <div key={p.track.id} className="trow rank-row" onDoubleClick={() => playTracks(tracks, i, { label: title })} onContextMenu={(e) => openMenuAt(e, trackMenu(p.track, navigate))}>
              <span className="rank">{i + 1}</span>
              <button type="button" style={{ position: 'relative', borderRadius: 10 }} aria-label={`Играть «${p.track.title}»`} onClick={() => playTracks(tracks, i, { label: title })}>
                <Cover src={p.track.thumb} size={48} radius={10} />
                <span className="rank-play"><IPlay size={16} /></span>
              </button>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                <span className="tt ell">{p.track.title}</span>
                <span className="ta ell">{p.track.artists.map((a) => a.name).join(', ')}</span>
              </span>
              <span className="muted small">{p.count} {plural(p.count, ['раз', 'раза', 'раз'])}</span>
            </div>
          ))}
        </div>
        <div className="tracks-panel">
          <div className="stat-head">Топ исполнителей</div>
          <div className="top-artists">
            {data.topArtists.map((a, i) => (
              <motion.button key={a.name} type="button" className="top-artist" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.07 }} onClick={() => a.id && navigate(`/artist/${a.id}`)}>
                <Cover src={a.thumb} size={84} round />
                <b className="ell">{a.name}</b>
                <span className="muted small">{Math.round(a.sec / 60)} мин</span>
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
