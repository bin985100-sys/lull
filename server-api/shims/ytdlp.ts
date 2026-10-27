// Ссылки на звук сервер получает в Python-части (yt-dlp); каталогу это не нужно
export type DlpStream = any;
export const stopOthers = (_id?: string) => {};
export function ytdlpResolve(): Promise<never> {
  return Promise.reject(new Error('yt-dlp недоступен в API каталога'));
}
