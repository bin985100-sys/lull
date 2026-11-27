import { Toggle as Switch } from '@/ui/Toggle';
import { useTheme } from '@/theme/state';
import { useIsFocused } from 'expo-router';
import { softPush } from '@/nav';
import { SettingsChoice, SettingsGroup as Group } from '@/components/SettingsVisuals';
import { WaveArt } from '@/ui/WaveArt';
import { useCoverColors } from '@/theme/useCoverColors';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { invalidate } from '@/api/useData';
import { WAVE_MODES } from '@/reco/engine';
import { useLibrary } from '@/store/library';
import { useTaste, type Balance, type RecoSettings } from '@/store/taste';
import { F } from '@/theme/tokens';
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

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 8 }}>
      <View style={{ flex: 1 }}><T style={{ fontSize: 16.5 }}>{label}</T>{hint ? <T v="small" style={{ marginTop: 2 }}>{hint}</T> : null}</View>
      <Switch accent="#b5c4f5" value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

export default function Prefs() {
  const {colors:C}=useTheme();
  const t = useTaste();
  const favs = useLibrary((s) => s.favArtists);
  const r = t.reco,focused=useIsFocused(),colors=useCoverColors(favs[0]?.avatar,'preferences');
  const set = <K extends keyof RecoSettings>(k: K, v: RecoSettings[K]) => t.setReco(k, v);
  /* после изменений подборки пересоберутся при следующем открытии */
  useEffect(() => () => invalidate('mix:'), []);
  const hiddenA = Object.entries(t.hiddenArtists), hiddenT = Object.entries(t.hiddenTracks);
  return (
    <Screen>
      <TopBar borderless title="Твой вкус" />
      <View style={{height:136,borderRadius:34,overflow:'hidden',justifyContent:'center',padding:22,marginTop:22}}><WaveArt colors={colors} animate={focused}/><View pointerEvents="none" style={{position:'absolute',inset:0,backgroundColor:'#0004'}}/><T style={{fontFamily:F.bold,fontSize:25,color:'#fff'}}>Ближе к тебе</T><T style={{fontSize:12,color:'#ffffffbb',marginTop:7}}>Любимое, открытия и настроение</T></View>

      <Group title="Знакомое и новое">
        <View accessibilityRole="radiogroup" accessibilityLabel="Знакомое и новое" style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
          {BAL.map(([v,l,h])=><SettingsChoice key={v} label={l} hint={h} icon={v<2?'heartF':v===2?'waves':'arrowUR'} tint={['#eea1bc','#c9b3ed','#a5d6df','#e8cd9d','#aee0b7'][v]} selected={r.balance===v} onPress={()=>{haptic();set('balance',v);}}/>)}
        </View>
      </Group>

      <Group title="Не повторять недавнее" hint="Трек, который ты уже слушал, не попадёт в подборки и волну в течение этого времени">
        <Segmented borderless label="Не повторять недавнее" value={String(r.noRepeatHours) as any} onChange={(v) => set('noRepeatHours', Number(v) as RecoSettings['noRepeatHours'])}
          items={[['0', 'Можно'], ['2', '2 ч'], ['12', '12 ч'], ['24', 'Сутки'], ['72', '3 дня']]} />
      </Group>

      <Group title="Разнообразие" hint="Сколько треков одного исполнителя может идти подряд">
        <Segmented borderless label="Треков одного исполнителя подряд" value={String(r.perArtist) as any} onChange={(v) => set('perArtist', Number(v) as RecoSettings['perArtist'])}
          items={[['1', '1'], ['2', '2'], ['3', '3'], ['5', '5']]} />
      </Group>

      <Group title="Что учитывать">
        <View style={{ borderRadius: 26, backgroundColor: C.bg, paddingHorizontal: 18 }}>
          <Toggle label="Пропуски" hint="Пропущенное в первые 30 секунд звучит реже" value={r.useSkips} onChange={(v) => set('useSkips', v)} />
          <Toggle label="Похожие исполнители" hint="Подмешивать тех, кто звучит как твои любимые" value={r.similarArtists} onChange={(v) => set('similarArtists', v)} />
          <Toggle label="Время суток" hint="Ночью спокойнее, утром и днём бодрее" value={r.timeOfDay} onChange={(v) => set('timeOfDay', v)} />
        </View>
      </Group>

      <Group title="Волна по умолчанию" hint="Так соберётся волна, если запустить её одним нажатием">
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
          {WAVE_MODES.map((m,i)=><SettingsChoice key={m.id} label={m.title} hint={m.text} icon={m.id==='favorite'?'heartF':m.id==='artist'?'user':m.id==='discover'?'arrowUR':'waves'} tint={['#a4d9e7','#cdb4e8','#ebce9c','#ee9ab4','#abbfe9','#ecb394'][i]} selected={r.waveMode===m.id} onPress={()=>{haptic();set('waveMode',m.id);}}/>)}
        </View>
        <View style={{ marginTop: 10 }}>
          <Segmented borderless label="Длина волны" value={String(r.waveLength) as any} onChange={(v) => set('waveLength', Number(v) as RecoSettings['waveLength'])} items={[['25', '25 треков'], ['50', '50 треков'], ['100', '100 треков']]} />
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
        <Btn borderless label="Выбрать заново" icon="pencil" kind="dark" small style={{ marginTop: 14 }} onPress={() => softPush('/onboarding')} />
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

      <Btn borderless label="Сбросить вкус" icon="refresh" kind="flat" style={{ marginTop: 30 }} onPress={() => confirm({ borderless:true,
        icon: 'refresh', title: 'Сбросить вкус?', text: 'Статистика прослушиваний, пропуски, скрытое и настройки рекомендаций обнулятся. Любимые треки и плейлисты останутся.',
        safe: 'Отмена', danger: 'Сбросить', onDanger: () => { t.resetTaste(); invalidate('mix:'); toast('Вкус сброшен', 'check'); },
      })} />
    </Screen>
  );
}
