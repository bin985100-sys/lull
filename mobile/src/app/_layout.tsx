import { Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold, useFonts } from '@expo-google-fonts/montserrat';
import { DarkTheme, router, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { PanResponder, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { startSync } from '@/api/sync';
import { Dock } from '@/components/Dock';
import { useLibrary } from '@/store/library';
import { C } from '@/theme/tokens';
import { CrashBanner, Guard, ScreenError } from '@/ui/Crash';
import { Overlays } from '@/ui/overlay';

SplashScreen.preventAutoHideAsync().catch(() => {});

/* Жест «назад» от левого края, как в iOS: у веб-приложения на экране «Домой» его нет */
const edge = PanResponder.create({
  onStartShouldSetPanResponder: () => router.canGoBack(),
  onMoveShouldSetPanResponder: (_, g) => g.dx > 8 && Math.abs(g.dy) < 30,
  onPanResponderRelease: (_, g) => { if (g.dx > 70 && router.canGoBack()) router.back(); },
});
function EdgeBack() {
  return <View {...edge.panHandlers} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 16, zIndex: 5 }} />;
}

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, text: C.tx, border: 'transparent', primary: C.tx } };

export default function Root() {
  const [fonts] = useFonts({ Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold });
  const [hydrated, setHydrated] = useState(useLibrary.persist.hasHydrated());
  useEffect(() => useLibrary.persist.onFinishHydration(() => setHydrated(true)), []);
  useEffect(() => { startSync(); }, []);
  const ready = fonts && hydrated;
  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}); }, [ready]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return (
    <SafeAreaProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <Guard name="screens">
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'slide_from_right' }}>
            <Stack.Screen name="index" options={{ animation: 'none' }} />
            <Stack.Screen name="listen" options={{ animation: 'fade' }} />
            <Stack.Screen name="discover" options={{ animation: 'fade' }} />
            <Stack.Screen name="collection" options={{ animation: 'fade' }} />
            <Stack.Screen name="new-playlist" options={{ animation: 'slide_from_bottom' }} />
          </Stack>
          </Guard>
          {Platform.OS === 'web' ? <EdgeBack /> : null}
          <Guard name="dock" quiet><Dock /></Guard>
          <Guard name="overlays" quiet><Overlays /></Guard>
          <CrashBanner />
        </View>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/* Ошибка внутри экрана показывается на этом экране, а не закрывает приложение */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return <ScreenError error={error} retry={retry} />;
}
