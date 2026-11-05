/* Ловушка ошибок: вместо вылета приложение показывает, что сломалось, и остаётся живым.
   Последняя ошибка сохраняется и видна в настройках — её можно скопировать и прислать. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Component, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { create } from 'zustand';

const KEY = 'lull.lastError';
export const useCrash = create<{ error: string | null }>(() => ({ error: null }));

export function report(e: unknown, where: string) {
  const err = e as Error;
  const text = `${where}: ${err?.message ?? String(e)}\n${(err?.stack ?? '').split('\n').slice(0, 8).join('\n')}`;
  useCrash.setState({ error: text });
  AsyncStorage.setItem(KEY, `${new Date().toISOString()}\n${text}`).catch(() => {});
  if (where === 'fatal' || where.startsWith('player')) sendCrash(text);
}
export const lastError = () => AsyncStorage.getItem(KEY);

/* Нативный вылет прошлого запуска (его записывает Android-часть приложения): показываем и отправляем на сервер */
const device = () => {
  const c = (Platform as any).constants || {};
  return `${Platform.OS} ${Platform.Version} ${c.Manufacturer ?? ''} ${c.Model ?? ''}`.trim();
};
export async function sendCrash(text: string) {
  try {
    const { LULL_API } = await import('@/api/lull');
    await fetch(`${LULL_API}/api/crash`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, device: device(), at: Date.now() }) });
  } catch {}
}
(async () => {
  try {
    const native = await AsyncStorage.getItem('lull.nativeCrash');
    if (!native) return;
    await AsyncStorage.removeItem('lull.nativeCrash');
    const text = `Прошлый запуск закрылся с ошибкой (${device()}):\n${native}`;
    useCrash.setState({ error: text.slice(0, 3000) });
    AsyncStorage.setItem(KEY, text).catch(() => {});
    sendCrash(native);
  } catch {}
})();

/* Фатальные JS-ошибки больше не закрывают приложение */
const EU = (globalThis as any).ErrorUtils;
if (EU?.setGlobalHandler) {
  const prev = EU.getGlobalHandler?.();
  EU.setGlobalHandler((e: unknown, fatal?: boolean) => {
    report(e, fatal ? 'fatal' : 'error');
    if (!fatal && prev) prev(e, fatal);
  });
}

export class Guard extends Component<{ name: string; children: ReactNode; quiet?: boolean }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { report(e, this.props.name); }
  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.quiet) return null;
    return (
      <View style={{ flex: 1, backgroundColor: '#000', padding: 24, paddingTop: 80, gap: 16 }}>
        <Text style={{ color: '#f5f5f4', fontSize: 24, fontWeight: '700' }}>Что-то сломалось</Text>
        <Text style={{ color: '#9ba0a7', fontSize: 15 }}>Сделай скриншот этого экрана и пришли — так быстрее починим.</Text>
        <Pressable onPress={() => this.setState({ failed: false })} style={{ alignSelf: 'flex-start', backgroundColor: '#f5f5f4', borderRadius: 999, paddingHorizontal: 22, paddingVertical: 14 }}>
          <Text style={{ color: '#000', fontWeight: '700' }}>Попробовать снова</Text>
        </Pressable>
        <ErrorText />
      </View>
    );
  }
}

function ErrorText() {
  const e = useCrash((s) => s.error);
  return <ScrollView><Text selectable style={{ color: '#ffb4a8', fontSize: 12, fontFamily: 'monospace' }}>{e}</Text></ScrollView>;
}

/* Плашка поверх приложения, если ошибка случилась вне экрана (в плеере, в фоне) */
export function CrashBanner() {
  const e = useCrash((s) => s.error);
  if (!e) return null;
  return (
    <Pressable onPress={() => useCrash.setState({ error: null })} style={{ position: 'absolute', top: 50, left: 12, right: 12, maxHeight: 260, backgroundColor: 'rgba(40,10,10,0.96)', borderRadius: 20, padding: 14, zIndex: 999 }}>
      <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 6 }}>Ошибка (нажми, чтобы скрыть) — пришли скриншот</Text>
      <ScrollView><Text selectable style={{ color: '#ffb4a8', fontSize: 11, fontFamily: 'monospace' }}>{e}</Text></ScrollView>
    </Pressable>
  );
}

export function ScreenError({ error, retry }: { error: Error; retry: () => void }) {
  report(error, 'screen');
  return (
    <View style={{ flex: 1, backgroundColor: '#000', padding: 24, paddingTop: 80, gap: 16 }}>
      <Text style={{ color: '#f5f5f4', fontSize: 24, fontWeight: '700' }}>Экран не открылся</Text>
      <Text style={{ color: '#9ba0a7', fontSize: 15 }}>Сделай скриншот и пришли — починим.</Text>
      <Pressable onPress={retry} style={{ alignSelf: 'flex-start', backgroundColor: '#f5f5f4', borderRadius: 999, paddingHorizontal: 22, paddingVertical: 14 }}>
        <Text style={{ color: '#000', fontWeight: '700' }}>Попробовать снова</Text>
      </Pressable>
      <Text selectable style={{ color: '#ffb4a8', fontSize: 12, fontFamily: 'monospace' }}>{String(error?.message)}{'\n'}{String(error?.stack ?? '').split('\n').slice(0, 8).join('\n')}</Text>
    </View>
  );
}
