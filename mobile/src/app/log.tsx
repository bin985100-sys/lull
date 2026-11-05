/* Журнал приложения: что происходило перед ошибкой или вылетом. Можно отправить разработчику. */
import { useEffect, useState } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';

import { clearLog, lastError, readLog } from '@/ui/Crash';
import { C } from '@/theme/tokens';
import { Btn, Screen, T, TopBar } from '@/ui/kit';
import { toast } from '@/ui/overlay';

export default function LogScreen() {
  const [text, setText] = useState('Загружаем…');
  const load = async () => {
    const [l, e] = await Promise.all([readLog(), lastError()]);
    setText([e ? `ПОСЛЕДНЯЯ ОШИБКА\n${e}\n` : '', 'ЖУРНАЛ', l || 'пусто'].filter(Boolean).join('\n'));
  };
  useEffect(() => { load(); }, []);
  return (
    <Screen scroll={false}>
      <TopBar title="Журнал" />
      <T v="small" style={{ marginTop: 8 }}>Если приложение вылетело — открой его снова и нажми «Отправить журнал».</T>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Btn label="Отправить журнал" icon="share" small style={{ flex: 1 }} onPress={() => Share.share({ message: text.slice(-60000) }).catch(() => {})} />
        <Btn label="Очистить" kind="dark" small onPress={async () => { await clearLog(); await load(); toast('Журнал очищен', 'check'); }} />
      </View>
      <ScrollView style={{ flex: 1, marginTop: 14, borderRadius: 18, backgroundColor: C.s1 }} contentContainerStyle={{ padding: 12 }}>
        <Text selectable style={{ color: C.tx2, fontSize: 11, lineHeight: 15, fontFamily: 'monospace' }}>{text}</Text>
      </ScrollView>
    </Screen>
  );
}
