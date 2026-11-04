import { Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold, useFonts } from '@expo-google-fonts/montserrat';
import { DarkTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Dock } from '@/components/Dock';
import { useLibrary } from '@/store/library';
import { C } from '@/theme/tokens';
import { Overlays } from '@/ui/overlay';

SplashScreen.preventAutoHideAsync().catch(() => {});

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, text: C.tx, border: 'transparent', primary: C.tx } };

export default function Root() {
  const [fonts] = useFonts({ Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold });
  const [hydrated, setHydrated] = useState(useLibrary.persist.hasHydrated());
  useEffect(() => useLibrary.persist.onFinishHydration(() => setHydrated(true)), []);
  const ready = fonts && hydrated;
  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}); }, [ready]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return (
    <SafeAreaProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'slide_from_right' }}>
            <Stack.Screen name="index" options={{ animation: 'none' }} />
            <Stack.Screen name="listen" options={{ animation: 'fade' }} />
            <Stack.Screen name="discover" options={{ animation: 'fade' }} />
            <Stack.Screen name="collection" options={{ animation: 'fade' }} />
            <Stack.Screen name="new-playlist" options={{ animation: 'slide_from_bottom' }} />
          </Stack>
          <Dock />
          <Overlays />
        </View>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
