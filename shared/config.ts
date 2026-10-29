/**
 * Ключи, которые задаёт разработчик сборки. Пользователю их вводить не нужно.
 *
 * DISCORD_CLIENT_ID — Application ID приложения на discord.com/developers
 *   (название приложения Discord показывает в статусе «Слушает …»).
 */
export const DISCORD_CLIENT_ID = '';

/**
 * Адрес сайта для ссылок «Поделиться». Когда встанем на домен — заменить здесь,
 * например 'https://player.example'. Ссылки вида <адрес>/artist/<id>.
 */
export const SHARE_BASE_URL = 'https://music.youtube.com';
/** true — ссылки ведут на наш сайт; false — пока ведут прямо на YouTube Music */
export const SHARE_OWN_DOMAIN = false;

/** Номер сборки — виден в журнале при запуске и в «О приложении», чтобы понять, какая версия запущена */
export const BUILD = '2026-10-29 · 40';
// Строка сервера Lull подставляется при сборке: файл relay.local (не в git) или переменная LULL_RELAY (секрет в GitHub)
declare const __LULL_RELAY__: string;
export const RELAY_DEFAULT: string = typeof __LULL_RELAY__ === 'string' ? __LULL_RELAY__ : '';
declare const __LULL_ACCOUNTS_ENABLED__: boolean;
export const ACCOUNTS_ENABLED = typeof __LULL_ACCOUNTS_ENABLED__ === 'boolean' && __LULL_ACCOUNTS_ENABLED__;
