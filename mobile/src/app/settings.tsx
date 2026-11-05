import { router } from 'expo-router';
import { resetTo } from '@/nav';
import { Pressable, Switch, View } from 'react-native';

import { logoutServer } from '@/api/auth';
import { signOutSync } from '@/api/sync';
import { linkYouTube } from '@/api/youtube';
import { player } from '@/player/player';
import { lastError, useCrash } from '@/ui/Crash';
import { useLibrary } from '@/store/library';
import { C, F } from '@/theme/tokens';
import { Icon, type IconName } from '@/ui/Icon';
import { Cover, Screen, T, TopBar } from '@/ui/kit';
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
        {lib.account.avatar ? <Cover uri={lib.account.avatar} size={60} radius={30} /> : <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: C.s3, alignItems: 'center', justifyContent: 'center' }}><Icon name="user" size={32} /></View>}
        <View style={{ flex: 1 }}><T style={{ fontFamily: F.bold, fontSize: 18 }}>{lib.account.name || 'Мой аккаунт'}</T><T v="small">{lib.account.provider ? `Вход через ${lib.account.provider}` : 'Локальный профиль'}</T></View>
      </View>
      <Group title="Музыка">
        <Row icon="sliders" label="Рекомендации и волна" onPress={() => router.push('/prefs')} />
        <Row icon="chart" label="Итоги месяца" onPress={() => router.push('/month')} />
        <Row icon="heart" label={`Любимые исполнители · ${lib.favArtists.length}`} onPress={() => router.push('/onboarding')} />
        <Row icon="clock" label="Сохранять историю" right={<Switch value={lib.settings.saveHistory} onValueChange={(v) => lib.setSetting('saveHistory', v)} trackColor={{ true: C.tx, false: C.s4 }} thumbColor={lib.settings.saveHistory ? '#000' : '#8a8f96'} accessibilityLabel="Сохранять историю" />} />
      </Group>
      <Group title="Перенос музыки">
        <Row icon="download" label="Из Spotify, Apple Music и других" onPress={() => router.push('/import')} />
        {lib.account.youtube
          ? <Row icon="download" label={`Перенести лайки и плейлисты · ${lib.account.youtube}`} onPress={() => router.push('/youtube')} />
          : <Row icon="google" label="Подключить YouTube Music" onPress={() => {
              if (!lib.account.token) return toast('Сначала войди в Lull через Google или Telegram', 'info');
              linkYouTube(() => { toast('YouTube Music подключён', 'check'); router.push('/youtube'); }).catch((e) => toast(e.message, 'info'));
            }} />}
      </Group>
      <Group title="Данные">
        <Row icon="eraser" label="Очистить историю" onPress={() => confirm({ icon: 'eraser', title: 'Очистить историю?', text: 'Любимые треки и плейлисты останутся.', safe: 'Отмена', danger: 'Очистить историю', onDanger: () => { lib.clearHistory(); toast('История очищена', 'check'); } })} />
        <Row icon="logout" label="Выйти" onPress={() => confirm({ icon: 'logout', title: 'Выйти из аккаунта?', text: 'Любимое, плейлисты и статистика сохранены в аккаунте и вернутся, когда войдёшь снова.', safe: 'Остаться', danger: 'Выйти', onDanger: async () => { player.stop(); await signOutSync(); logoutServer(); lib.setAccount({ provider: null, token: undefined, userId: undefined, youtube: null }); resetTo('/welcome'); } })} />
      </Group>
      <Group title="О приложении">
        <Row icon="info" label="Музыка — каталог Lull и Audius" />
        <Row icon="doc" label="Версия 0.1 · ранняя сборка" />
        <Row icon="doc" label="Журнал — отправить разработчику" onPress={() => router.push('/log')} />
        <Row icon="info" label="Показать последнюю ошибку" onPress={async () => { const e = await lastError(); if (e) useCrash.setState({ error: e }); else toast('Ошибок не было', 'check'); }} />
      </Group>
    </Screen>
  );
}
