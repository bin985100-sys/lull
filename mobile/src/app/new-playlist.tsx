import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';

import type { Track } from '@/api/audius';
import { useLibrary } from '@/store/library';
import { C, F } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { Btn, Screen, T, TopBar } from '@/ui/kit';
import { toast } from '@/ui/overlay';

export default function NewPlaylist() {
  const { add } = useLocalSearchParams<{ add?: string }>();
  const pending: Track | undefined = add ? JSON.parse(add) : undefined;
  /* фокус после анимации входа экрана, иначе браузер его теряет */
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 340); return () => clearTimeout(t); }, []);
  const [name, setName] = useState('');
  const busy = useRef(false);
  const create = () => {
    if (!name.trim() || busy.current) return;
    busy.current = true;
    const id = useLibrary.getState().createPlaylist(name.trim(), pending ? [pending] : []);
    if (pending) { router.back(); toast(`Плейлист «${name.trim()}» создан`, 'check'); return; }
    router.replace({ pathname: '/my/[id]', params: { id } });
    router.push({ pathname: '/add-tracks', params: { id } });
  };
  return (
    <Screen dock={false}>
      <TopBar close title="Новый плейлист" />
      <View style={{ alignItems: 'center', marginTop: 26, gap: 12 }}>
        <View style={{ width: 176, height: 176, borderRadius: 40, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' }}><Icon name="coverEdit" size={72} /></View>
        <T v="sub">Обложка соберётся из треков</T>
      </View>
      <T style={{ fontFamily: F.bold, marginTop: 26, marginBottom: 10 }}>Название</T>
      <TextInput value={name} onChangeText={setName} ref={inputRef} maxLength={40} placeholder="Например, «Вечер»" placeholderTextColor={C.tx3} onSubmitEditing={create} returnKeyType="done"
        accessibilityLabel="Название плейлиста" style={{ height: 56, borderRadius: 20, backgroundColor: C.s2, paddingHorizontal: 20, color: C.tx, fontFamily: F.semi, fontSize: 17, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null) }} />
      <Btn label="Создать" icon="arrow" disabled={!name.trim()} onPress={create} style={{ marginTop: 28 }} />
    </Screen>
  );
}
