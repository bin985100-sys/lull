import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { player } from '@/player/player';
import { fmtListen, monthIn, monthName, monthStats, prevMonthKey, useTaste } from '@/store/taste';
import { C, F } from '@/theme/tokens';
import { Icon, type IconName } from '@/ui/Icon';
import { Press, SectionHead, T } from '@/ui/kit';
import { openArtist } from './Cards';

/* Живые карточки на главной: собираются из того, что и сколько ты слушаешь в этом месяце */
function Card({ img, eyebrow, title, sub, icon, onPress, wide }: { img?: string; eyebrow: string; title: string; sub?: string; icon?: IconName; onPress: () => void; wide?: boolean }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={`${eyebrow}. ${title}. ${sub ?? ''}`}
      style={{ width: wide ? 300 : 230, height: 176, borderRadius: 28, overflow: 'hidden', backgroundColor: C.s1, padding: 18, justifyContent: 'space-between' }}>
      {img ? (
        <>
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={28} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
        </>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T v="label" style={{ color: 'rgba(255,255,255,0.75)', fontFamily: F.bold, letterSpacing: 0.3 }}>{eyebrow}</T>
        {icon ? <Icon name={icon} size={22} /> : null}
      </View>
      <View style={{ gap: 4 }}>
        <T numberOfLines={2} style={{ fontFamily: F.bold, fontSize: 22, lineHeight: 26 }}>{title}</T>
        {sub ? <T v="small" numberOfLines={2} style={{ color: 'rgba(255,255,255,0.8)' }}>{sub}</T> : null}
      </View>
    </Press>
  );
}

export function Insights() {
  useTaste((s) => s.months); // перерисовка, когда копится время
  const now = new Date();
  const m = monthStats();
  const prev = monthStats(prevMonthKey());
  const cards: ReactNode[] = [];
  const mName = monthName(now);
  const title = `Твой ${mName}`;
  if (!m || m.secs < 60) {
    cards.push(<Card key="start" eyebrow={title} title="Начнётся с первого трека" sub="Здесь появятся любимые исполнители и треки месяца" icon="sparkle" onPress={() => router.push('/discover')} wide />);
  } else {
    const topA = m.artists[0];
    const topT = m.tracks[0];
    cards.push(<Card key="month" img={topT?.track.artworkLarge || topT?.track.artwork} eyebrow={title.toUpperCase()} title={`${fmtListen(m.secs)} музыки`} sub={topA ? `Больше всего — ${topA.name}` : undefined} icon="chart" onPress={() => router.push('/month')} wide />);
    if (topA && topA.secs >= 120) {
      const art = m.tracks.find((x) => x.track.artistId === topA.id)?.track.artwork;
      cards.push(<Card key="artist" img={art} eyebrow="ТЫ СЛУШАЕШЬ" title={topA.name} sub={`${fmtListen(topA.secs)} в ${monthIn(now)}`} icon="user" onPress={() => openArtist({ id: topA.id, source: topA.source })} />);
    }
    if (topT && topT.plays >= 2) {
      cards.push(<Card key="repeat" img={topT.track.artwork} eyebrow="НА ПОВТОРЕ" title={topT.track.title} sub={`${topT.plays} ${topT.plays % 10 >= 2 && topT.plays % 10 <= 4 && (topT.plays % 100 < 10 || topT.plays % 100 >= 20) ? 'раза' : 'раз'} в ${monthIn(now)}`} icon="repeat" onPress={() => player.play([topT.track], topT.track.id)} />);
    }
    const prevKeys = new Set(prev?.artists.map((a) => a.key) ?? []);
    const found = m.artists.find((a) => !prevKeys.has(a.key) && a.secs >= 300 && a !== topA);
    if (found && prev) {
      const art = m.tracks.find((x) => x.track.artistId === found.id)?.track.artwork;
      cards.push(<Card key="found" img={art} eyebrow="ОТКРЫТИЕ МЕСЯЦА" title={found.name} sub={`Новый для тебя — уже ${fmtListen(found.secs)}`} icon="sparkle" onPress={() => openArtist({ id: found.id, source: found.source })} />);
    }
    const days = Object.keys(m.days).length;
    if (days >= 2) cards.push(<Card key="days" eyebrow="С МУЗЫКОЙ" title={`${days} ${days % 10 === 1 && days % 100 !== 11 ? 'день' : days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 10 || days % 100 >= 20) ? 'дня' : 'дней'} из ${now.getDate()}`} sub={`В среднем ${fmtListen(m.secs / days)} в день`} icon="clock" onPress={() => router.push('/month')} />);
  }
  if (prev?.artists.length) {
    const cur = new Set(m?.artists.map((a) => a.key) ?? []);
    const miss = prev.artists.find((a) => !cur.has(a.key) && a.secs >= 600);
    if (miss) {
      const art = prev.tracks.find((x) => x.track.artistId === miss.id)?.track.artwork;
      cards.push(<Card key="miss" img={art} eyebrow="СКУЧАЕШЬ?" title={miss.name} sub={`В прошлом месяце — ${fmtListen(miss.secs)}`} icon="heart" onPress={() => openArtist({ id: miss.id, source: miss.source })} />);
    }
  }
  return (
    <View>
      <SectionHead title={title} onMore={m && m.secs >= 60 ? () => router.push('/month') : undefined} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>{cards}</ScrollView>
    </View>
  );
}
