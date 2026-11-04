import { router } from 'expo-router';
import { Pressable, Switch, View } from 'react-native';

import { player } from '@/player/player';
import { useLibrary } from '@/store/library';
import { C, F } from '@/theme/tokens';
import { Icon, type IconName } from '@/ui/Icon';
import { Screen, T, TopBar } from '@/ui/kit';
import { confirm, toast } from '@/ui/overlay';

function Row({ icon, label, onPress, right }: { icon: IconName; label: string; onPress?: () => void; right?: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 64 }}>
      <Icon name={icon} size={28} /><T style={{ flex: 1, fontSize: 16.5 }}>{label}</T>{right ?? (onPress ? <Icon name="chev" size={22} /> : null)}
    </Pressable>
  );
}
const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View><T v="h2" style={{ fontSize: 20, marginTop: 24, marginBottom: 12 }}>{title}</T><View style={{ borderRadius: 26, backgroundColor: C.s1, paddingHorizontal: 18, paddingVertical: 4 }}>{children}</View></View>
);

export default function Settings() {
  const lib = useLibrary();
  return (
    <Screen>
      <TopBar title="Настройки" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 14, borderRadius: 26, backgroundColor: C.s1, marginTop: 14 }}>
        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: C.s3, alignItems: 'center', justifyContent: 'center' }}><Icon name="user" size={32} /></View>
        <View style={{ flex: 1 }}><T style={{ fontFamily: F.bold, fontSize: 18 }}>{lib.account.name || 'Мой аккаунт'}</T><T v="small">{lib.account.provider ? `Вход через ${lib.account.provider}` : 'Локальный профиль'}</T></View>
      </View>
      <Group title="Музыка">
        <Row icon="heart" label={`Любимые исполнители · ${lib.favArtists.length}`} onPress={() => router.push('/onboarding')} />
        <Row icon="clock" label="Сохранять историю" right={<Switch value={lib.settings.saveHistory} onValueChange={(v) => lib.setSetting('saveHistory', v)} trackColor={{ true: C.tx, false: C.s4 }} thumbColor={lib.settings.saveHistory ? '#000' : '#8a8f96'} accessibilityLabel="Сохранять историю" />} />
      </Group>
      <Group title="Данные">
        <Row icon="eraser" label="Очистить историю" onPress={() => confirm({ icon: 'eraser', title: 'Очистить историю?', text: 'Любимые треки и плейлисты останутся.', safe: 'Отмена', danger: 'Очистить историю', onDanger: () => { lib.clearHistory(); toast('История очищена', 'check'); } })} />
        <Row icon="logout" label="Выйти" onPress={() => confirm({ icon: 'logout', title: 'Выйти из аккаунта?', text: 'Пока профиль хранится на этом устройстве: любимое и плейлисты останутся здесь.', safe: 'Остаться', danger: 'Выйти', onDanger: () => { player.stop(); lib.setAccount({ provider: null }); router.replace('/welcome'); } })} />
      </Group>
      <Group title="О приложении">
        <Row icon="info" label="Музыка — каталог Lull и Audius" />
        <Row icon="doc" label="Версия 0.1 · ранняя сборка" />
      </Group>
    </Screen>
  );
}
