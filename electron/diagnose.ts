import type { DiagStep, Track } from '../shared/types';
import { viaInnertube, viaYtDlp } from './yt';
import { scSearch, ytdlpVersion } from './ytdlp';

/** Проверка воспроизведения трека всеми способами — чтобы сразу видеть, что именно ломается. */
export async function diagnose(t: Track): Promise<DiagStep[]> {
  const steps: DiagStep[] = [];
  const step = async (name: string, fn: () => Promise<string>) => {
    const t0 = Date.now();
    try {
      steps.push({ name, ok: true, ms: Date.now() - t0, detail: await fn() });
    } catch (e) {
      steps.push({ name, ok: false, ms: Date.now() - t0, detail: String((e as Error)?.message ?? e) });
    }
    steps[steps.length - 1].ms = Date.now() - t0;
  };
  const fmt = (s: { mime: string; bitrate: number; contentLength: number }) => `${s.mime}, ${Math.round(s.bitrate / 1000)} кбит/с, ${(s.contentLength / 1048576).toFixed(1)} МБ`;
  await step('YouTube — встроенный клиент', async () => fmt(await viaInnertube(t.id)));
  await step('yt-dlp — версия', () => ytdlpVersion());
  await step('YouTube — через yt-dlp', async () => fmt(await viaYtDlp(t.id, undefined, 'keep')));
  await step('SoundCloud — запасной источник', async () => {
    const r = await scSearch(`${t.artists?.[0]?.name ?? ''} ${t.title}`, 3);
    if (!r.length) throw new Error('ничего не нашлось');
    return r.map((x) => `${x.title} (${Math.round(x.duration)} с)`).join(' · ');
  });
  return steps;
}
