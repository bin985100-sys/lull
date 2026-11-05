import { View } from 'react-native';

import { openArtist } from '@/components/Cards';
import { TrackRow } from '@/components/TrackRow';
import { fmtListen, monthIn, monthName, monthStats, useTaste } from '@/store/taste';
import { C, F } from '@/theme/tokens';
import { Cover, Empty, Press, Screen, SectionHead, T, TopBar } from '@/ui/kit';

/* Итоги месяца: время, исполнители, треки, дни с музыкой */
export default function Month() {
  useTaste((s) => s.months);
  const now = new Date();
  const m = monthStats();
  const name = monthName(now);
  if (!m || m.secs < 60) return <Screen><TopBar title={`Твой ${name}`} /><Empty icon="chart" title="Пока мало музыки" text="Послушай немного — и здесь появятся итоги месяца." /></Screen>;
  const maxA = m.artists[0]?.secs || 1;
  const daysIn = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const maxD = Math.max(...Object.values(m.days), 1);
  const tracks = m.tracks.slice(0, 15).map((x) => x.track);
  return (
    <Screen>
      <TopBar />
      <T v="label" style={{ marginTop: 14, fontFamily: F.bold, letterSpacing: 0.4 }}>ТВОЙ {name.toUpperCase()}</T>
      <T v="xl" style={{ marginTop: 6 }} accessibilityRole="header">{fmtListen(m.secs)}</T>
      <T v="sub" style={{ marginTop: 4 }}>музыки в {monthIn(now)} · {Object.keys(m.days).length} дн. с музыкой</T>

      {/* дни месяца: высота столбика — сколько слушал */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 70, marginTop: 22 }} accessibilityLabel="Прослушивание по дням">
        {Array.from({ length: daysIn }, (_, i) => {
          const v = m.days[`${mk}-${String(i + 1).padStart(2, '0')}`] || 0;
          return <View key={i} style={{ flex: 1, height: Math.max(3, (v / maxD) * 70), borderRadius: 3, backgroundColor: v ? C.tx : C.s3, opacity: i + 1 > now.getDate() ? 0.35 : 1 }} />;
        })}
      </View>

      <View style={{ marginTop: 30 }}>
        <SectionHead title="Исполнители месяца" />
        <View style={{ gap: 12 }}>
          {m.artists.slice(0, 7).map((a, i) => {
            const art = m.tracks.find((x) => x.track.artistId === a.id)?.track.artwork;
            return (
              <Press key={a.key} onPress={() => a.id && openArtist({ id: a.id, source: a.source })} accessibilityRole="button" accessibilityLabel={`${i + 1}. ${a.name}, ${fmtListen(a.secs)}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <T v="sub" style={{ width: 20 }}>{i + 1}</T>
                <Cover uri={art} size={52} radius={26} />
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <T numberOfLines={1} style={{ flex: 1, fontFamily: F.bold }}>{a.name}</T>
                    <T v="small" style={{ fontVariant: ['tabular-nums'] }}>{fmtListen(a.secs)}</T>
                  </View>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: C.s3 }}><View style={{ height: 4, borderRadius: 2, width: `${(a.secs / maxA) * 100}%`, backgroundColor: C.tx }} /></View>
                </View>
              </Press>
            );
          })}
        </View>
      </View>

      <View style={{ marginTop: 30 }}>
        <SectionHead title="Треки месяца" />
        {tracks.map((t, i) => <TrackRow key={t.id} track={t} list={tracks} num={i + 1} sub />)}
      </View>
    </Screen>
  );
}
