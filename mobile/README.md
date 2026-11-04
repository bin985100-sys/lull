# Lull Mobile

Мобильное приложение Lull для телефонов и планшетов (iOS, Android, веб).

- Expo SDK 58, Expo Router, TypeScript, React Native 0.88
- Звук: `expo-audio` (`AudioPlaylist`): фоновое воспроизведение, экран блокировки, следующий/предыдущий
- Анимации: Reanimated 4 — капсула навигации растёт в мини-плеер и в полный плеер, переливание запуск↔пауза, смена трека и цвета
- Каталог: открытый API Audius (`https://api.audius.co/v1`), полные треки
- Данные пользователя: Zustand + AsyncStorage (на устройстве)

## Запуск

```bash
npm install
npx expo start          # Expo Go не подойдёт для фонового звука — нужен dev build
npx expo run:android    # локальная сборка с Android SDK
npx expo export -p web  # веб-версия в dist/
```

Необязательно: `EXPO_PUBLIC_AUDIUS_API_KEY` — ключ приложения Audius для повышенных лимитов.
