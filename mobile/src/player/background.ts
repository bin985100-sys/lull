/* Работа поверх других приложений и в фоне.
   Android: режим «смешивать» (см. player.setMix) + просьба не усыплять Lull ради батареи — Samsung любит выгружать фоновые плееры.
   iPhone (веб-приложение): Safari сам останавливает звук сайта, когда играет другое приложение — обойти это нельзя. */
import { Linking, Platform } from 'react-native';

import { log } from '@/ui/Crash';

const PKG = 'website.lull.app';

export const canMix = Platform.OS === 'android';

/* Системное окно «Разрешить Lull работать в фоне без ограничений?» */
export async function askBattery() {
  if (Platform.OS !== 'android') return;
  try {
    // модуль только для Android: на вебе (iPhone) его нет, поэтому подгружаем по месту
    const IntentLauncher = require('expo-intent-launcher') as typeof import('expo-intent-launcher');
    await IntentLauncher.startActivityAsync('android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', { data: `package:${PKG}` });
    log('фон: запрос на работу без ограничений батареи показан');
  } catch (e) {
    log(`фон: окно батареи не открылось (${(e as Error).message}), открываю настройки приложения`);
    await Linking.openSettings().catch(() => {});
  }
}

/* Настройки приложения — там у Samsung «Батарея → Без ограничений» */
export const openAppSettings = () => Linking.openSettings().catch(() => {});
