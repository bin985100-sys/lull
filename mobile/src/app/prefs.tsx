import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { invalidate } from '@/api/useData';
import { WAVE_MODES } from '@/reco/engine';
import { useLibrary } from '@/store/library';
import { useTaste, type Balance, type RecoSettings } from '@/store/taste';
import { C, F } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { Btn, Cover, haptic, Screen, Segmented, T, TopBar } from '@/ui/kit';
import { confirm, toast } from '@/ui/overlay';

const BAL: [Balance, string, string][] = [
  [0, 'Только любимое', 'Твои исполнители и треки'],
  [1, 'Больше любимого', 'Иногда что-то новое'],
  [2, 'Поровну', 'Знакомое и новое пополам'],
  [3, 'Больше нового', 'Похожие исполнители и находки'],
  [4, 'Только новое', 'То, что ты ещё не слушал'],
];

const Group = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <View style={{ marginTop: 26 }}>
    <T v="h2" style={{ fontSize: 20 }}>{title}</T>
    {hint ? <T v="small" style={{ marginTop: 4 }}>{hint}</T> : null}
    <View style={{ marginTop: 12 }}>{children}</View>
  </View>
);
function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 8 }}>
      <View style={{ flex: 1 }}><T style={{ fontSize: 16.5 }}>{label}</T>{hint ? <T v="small" style={{ marginTop: 2 }}>{hint}</T> : null}</View>
      <Switch value={value} onValueChange={(v) => { haptic(); onChange(v); }} trackColor={{ true: C.tx, false: C.s4 }} thumbColor={value ? '#000' : '#8a8f96'} accessibilityLabel={label} />
    </View>
  );
}

export default function Prefs() {
  const t = useTaste();
  const favs = useLibrary((s) => s.favArtists);
  const r = t.reco;
  const set = <K extends keyof RecoSettings>(k: K, v: RecoSettings[K]) => t.setReco(k, v);
  /* после изменений подборки пересоберутся при следующем открытии */
  useEffect(() => () => invalidate('mix:'), []);
  const hiddenA = Object.entries(t.hiddenArtists), hiddenT = Object.entries(t.hiddenTracks);
  return (
    <Screen>
      <TopBar title="Рекомендации" />
      <T v="body" style={{ marginTop: 10 }}>Lull учитывает, что и сколько ты слушаешь, лайки, пропуски в первые 30 секунд и то, что ты скрыл. Здесь можно подкрутить, как он подбирает музыку.</T>

      <Group title="Знакомое и новое">
        <View style={{ gap: 6 }}>
          {BAL.map(([v, l, h]) => {
            const on = r.balance === v;
            return (
              <Pressable key={v} onPress={() => { haptic(); set('balance', v); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 20, backgroundColor: on ? C.s2 : 'transparent' }}>
                <View style={{ flex: 1 }}><T style={{ fontFamily: on ? F.bold : F.semi }}>{l}</T><T v="small">{h}</T></View>
                {on ? <Icon name="check" size={22} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Group>

      <Group title="Не повторять недавнее" hint="Трек, который ты уже слушал, не попадёт в подборки и волну в течение этого времени">
        <Segmented label="Не повторять недавнее" value={String(r.noRepeatHours) as any} onChange={(v) => set('noRepeatHours', Number(v) as RecoSettings['noRepeatHours'])}
          items={[['0', 'Можно'], ['2', '2 ч'], ['12', '12 ч'], ['24', 'Сутки'], ['72', '3 дня']]} />
      </Group>

      <Group title="Разнообразие" hint="Сколько треков одного исполнителя может идти подряд">
        <Segmented label="Треков одного исполнителя подряд" value={String(r.perArtist) as any} onChange={(v) => set('perArtist', Number(v) as RecoSettings['perArtist'])}
          items={[['1', '1'], ['2', '2'], ['3', '3'], ['5', '5']]} />
      </Group>

      <Group title="Что учитывать">
        <View style={{ borderRadius: 26, backgroundColor: C.s1, paddingHorizontal: 18 }}>
          <Toggle label="Пропуски" hint="Пропущенное в первые 30 секунд звучит реже" value={r.useSkips} onChange={(v) => set('useSkips', v)} />
          <Toggle label="Похожие исполнители" hint="Подмешивать тех, кто звучит как твои любимые" value={r.similarArtists} onChange={(v) => set('similarArtists', v)} />
          <Toggle label="Время суток" hint="Ночью спокойнее, утром и днём бодрее" value={r.timeOfDay} onChange={(v) => set('timeOfDay', v)} />
        </View>
      </Group>

      <Group title="Волна по умолчанию" hint="Так соберётся волна, если запустить её одним нажатием">
        <View style={{ gap: 6 }}>
          {WAVE_MODES.map((m) => {
            const on = r.waveMode === m.id;
            return (
              <Pressable key={m.id} onPress={() => { haptic(); set('waveMode', m.id); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 20, backgroundColor: on ? C.s2 : 'transparent' }}>
                <View style={{ flex: 1 }}><T style={{ fontFamily: on ? F.bold : F.semi }}>{m.title}</T><T v="small">{m.text}</T></View>
                {on ? <Icon name="check" size={22} /> : null}
              </Pressable>
            );
          })}
        </View>
        <View style={{ marginTop: 10 }}>
          <Segmented label="Длина волны" value={String(r.waveLength) as any} onChange={(v) => set('waveLength', Number(v) as RecoSettings['waveLength'])} items={[['25', '25 треков'], ['50', '50 треков'], ['100', '100 треков']]} />
        </View>
      </Group>

      <Group title="Любимые исполнители" hint="С них начинаются подборки">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {favs.slice(0, 12).map((a) => (
            <View key={a.id} style={{ width: 72, alignItems: 'center', gap: 6 }}>
              <Cover uri={a.avatar} size={64} radius={32} />
              <T v="small" numberOfLines={1} style={{ color: C.tx }}>{a.name}</T>
            </View>
          ))}
        </View>
        <Btn label="Выбрать заново" icon="pencil" kind="dark" small style={{ marginTop: 14 }} onPress={() => router.push('/onboarding')} />
      </Group>

      <Group title="Скрыто из рекомендаций" hint={hiddenA.length || hiddenT.length ? undefined : 'Скрыть трек или исполнителя можно в меню трека'}>
        {hiddenA.map(([k, a]) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52 }}>
            <Icon name="user" size={24} /><T style={{ flex: 1 }} numberOfLines={1}>{a.name}</T>
            <Pressable onPress={() => t.unhideArtist(k)} accessibilityRole="button" hitSlop={8}><T v="sub">Вернуть</T></Pressable>
          </View>
        ))}
        {hiddenT.map(([id, x]) => (
          <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52 }}>
            <Icon name="note" size={24} /><T style={{ flex: 1 }} numberOfLines={1}>{x.title} · {x.artist}</T>
            <Pressable onPress={() => t.unhideTrack(id)} accessibilityRole="button" hitSlop={8}><T v="sub">Вернуть</T></Pressable>
          </View>
        ))}
      </Group>

      <Btn label="Сбросить вкус" icon="refresh" kind="flat" style={{ marginTop: 30 }} onPress={() => confirm({
        icon: 'refresh', title: 'Сбросить вкус?', text: 'Статистика прослушиваний, пропуски, скрытое и настройки рекомендаций обнулятся. Любимые треки и плейлисты останутся.',
        safe: 'Отмена', danger: 'Сбросить', onDanger: () => { t.resetTaste(); invalidate('mix:'); toast('Вкус сброшен', 'check'); },
      })} />
    </Screen>
  );
}
