# Player — десктопный музыкальный плеер

Electron + React + TypeScript. Каталог и звук — YouTube Music (через youtubei.js), синхронные тексты — LRCLIB.

## Запуск

Нужен Node.js 22+.

```bash
npm install
npm run dev        # приложение в режиме разработки (горячая перезагрузка интерфейса)
npm run dev:web    # только интерфейс в браузере на тестовых данных, без Electron и сети
npm run typecheck  # проверка типов
npm run dist       # установщик для Windows → папка release/
```

## Что где

```
electron/           main-процесс
  main.ts           окно, IPC
  yt.ts             YouTube Music: главная, поиск, альбомы, плейлисты, исполнители, потоки
  protocol.ts       схема media:// — проксирует аудио по частям (Range) и обложки
  lyrics.ts         тексты: LRCLIB (синхронные) → YouTube Music (обычные)
  downloads.ts      скачивание треков для офлайна
  discord.ts        Discord Rich Presence
  store.ts          хранилище JSON в папке пользователя
src/                интерфейс
  player/engine.ts  аудиодвижок: 2 деки, кроссфейд, эквалайзер 10 полос, нормализация
  store/            состояние: плеер/очередь, библиотека, настройки, интерфейс
  screens/          Главная, Поиск, Библиотека, Коллекция (альбом/плейлист/любимое/скачанное), Исполнитель
  components/       плеер, «Сейчас играет», настройки, меню, карточки, списки треков
  lib/potoken.ts    PO-токен (BotGuard) для потоков YouTube
  mock/             тестовые данные для dev:web
shared/             общие типы и контракт API
```

## Брендинг

- Логотип: замените `src/assets/logo.svg`.
- Иконка приложения: положите `build/icon.png` (512×512) и верните строку `icon: build/icon.png` в `electron-builder.yml`.
- Название: `productName` в `package.json` и `electron-builder.yml`, `<title>` в `index.html`.

## Как устроено воспроизведение

1. Интерфейс ставит в `<audio>` адрес `media://stream/<videoId>`.
2. main-процесс получает прямую ссылку на аудио (youtubei.js + расшифровка n/sig в изолированном `vm`) и отдаёт поток кусками по 1 МБ.
   Если клиент YouTube Music отказал, пробует ANDROID_VR и TV.
3. Скачанный трек играет из локального файла.
4. Звук идёт через Web Audio: нормализация → эквалайзер → громкость.
