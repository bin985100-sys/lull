/* Текст песни: сервер Lull ищет его в LRCLIB, Better Lyrics (тайминг по словам и слогам) и YouTube Music.
   Здесь — запрос и разбор форматов в одну модель: строки со временем, слова со временем, кто поёт строку. */
import type { Track } from './audius';
import { LULL_API } from './lull';

export type LWord = { t: number; e: number; text: string; space: boolean };
export type LLine = {
  t: number; e: number; text: string;
  /** слова со своим временем (TTML/расширенный LRC) или разложенные равномерно по строке */
  words: LWord[];
  /** тайминг слов настоящий, а не оценка */
  timedWords: boolean;
  /** кто поёт: первый голос слева, второй — справа (как дуэты в Apple Music) */
  side: 'left' | 'right';
  /** подпевка/бэк-вокал — мельче и тусклее */
  bg?: string;
};
export type Lyrics = { lines: LLine[] | null; plain: string | null; source: string | null; sync: 'syllable' | 'word' | 'line' | 'none' };

/* ---------- время ---------- */
/** «12.3», «12.3s», «1:02.5», «00:01:02.500» → секунды */
export function parseTime(v: string): number {
  const parts = v.replace(/s$/, '').split(':').map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/* ---------- слова без настоящего тайминга: раскладываем по длине ---------- */
export function spreadWords(text: string, t: number, e: number): LWord[] {
  const ws = text.split(/\s+/).filter(Boolean);
  if (!ws.length) return [];
  const total = ws.reduce((n, w) => n + w.length + 1, 0);
  const span = Math.max(0.2, e - t);
  let acc = 0;
  return ws.map((w, i) => {
    const s = t + (acc / total) * span; acc += w.length + 1;
    return { t: s, e: t + (acc / total) * span, text: w, space: i > 0 };
  });
}

/* ---------- LRC: [mm:ss.xx] строка, в расширенном варианте <mm:ss.xx> перед словами ---------- */
export function parseLrc(lrc: string, duration = 0): LLine[] {
  const raw: { t: number; body: string }[] = [];
  for (const line of lrc.split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d{1,2}):(\d{2}(?:[.:]\d{1,3})?)\]/g)];
    if (!stamps.length) continue;
    const body = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) raw.push({ t: Number(m[1]) * 60 + Number(m[2].replace(':', '.')), body });
  }
  raw.sort((a, b) => a.t - b.t);
  return raw.map((r, i) => {
    const e = raw[i + 1]?.t ?? (duration > r.t ? Math.min(duration, r.t + 8) : r.t + 5);
    const inline = [...r.body.matchAll(/<(\d{1,2}):(\d{2}(?:\.\d{1,3})?)>\s*([^<]*)/g)];
    if (inline.length) {
      const words: LWord[] = [];
      inline.forEach((m, k) => {
        const s = Number(m[1]) * 60 + Number(m[2]);
        const next = inline[k + 1] ? Number(inline[k + 1][1]) * 60 + Number(inline[k + 1][2]) : e;
        const txt = m[3];
        for (const w of txt.trim().split(/\s+/).filter(Boolean)) words.push({ t: s, e: next, text: w, space: words.length > 0 });
      });
      const text = words.map((w) => w.text).join(' ');
      return { t: r.t, e, text, words, timedWords: true, side: 'left' as const };
    }
    return { t: r.t, e, text: r.body, words: spreadWords(r.body, r.t, e), timedWords: false, side: 'left' as const };
  });
}

/* ---------- TTML (Better Lyrics / Apple): <p begin end ttm:agent><span begin end>слог</span>…</p> ---------- */
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'");

export function parseTtml(ttml: string): LLine[] {
  const lines: LLine[] = [];
  const agents: string[] = [];
  for (const pm of ttml.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const ptag = pm[1];
    const pt = parseTime(attr(ptag, 'begin') || '0'), pe = parseTime(attr(ptag, 'end') || '0');
    const agent = attr(ptag, 'ttm:agent') || 'v1';
    if (!agents.includes(agent)) agents.push(agent);
    const words: LWord[] = [];
    const bgWords: LWord[] = [];
    /* идём по тегам и тексту: текст внутри span со временем — слог; пробел между span — граница слова */
    const stack: { begin?: number; end?: number; bg: boolean }[] = [];
    let pendingSpace = false;
    for (const tok of pm[2].matchAll(/<\/?span\b[^>]*>|<br\s*\/?>|[^<]+/g)) {
      const s = tok[0];
      if (s.startsWith('</span')) { stack.pop(); continue; }
      if (s.startsWith('<span')) {
        const b = attr(s, 'begin'), e = attr(s, 'end');
        const parentBg = stack.at(-1)?.bg ?? false;
        stack.push({ begin: b != null ? parseTime(b) : undefined, end: e != null ? parseTime(e) : undefined, bg: parentBg || attr(s, 'ttm:role') === 'x-bg' });
        continue;
      }
      if (s.startsWith('<br')) { pendingSpace = true; continue; }
      const text = decode(s);
      const top = [...stack].reverse().find((x) => x.begin != null);
      if (!top) { if (/\s/.test(text)) pendingSpace = true; if (!text.trim()) continue; }
      const target = stack.some((x) => x.bg) ? bgWords : words;
      const parts = text.split(/(\s+)/);
      for (const part of parts) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { pendingSpace = true; continue; }
        const t0 = top?.begin ?? pt, e0 = top?.end ?? pe;
        const last = target.at(-1);
        /* слог без пробела перед ним — продолжение того же слова: время слова растягиваем, текст склеиваем */
        if (last && !pendingSpace) { last.text += part; last.e = Math.max(last.e, e0); }
        else target.push({ t: t0, e: e0, text: part, space: target.length > 0 });
        pendingSpace = false;
      }
    }
    const text = words.map((w) => (w.space ? ' ' : '') + w.text).join('');
    if (!text && !bgWords.length) continue;
    lines.push({
      t: pt || words[0]?.t || 0, e: pe || words.at(-1)?.e || pt + 4, text, words, timedWords: words.length > 0, side: 'left',
      bg: bgWords.length ? bgWords.map((w) => (w.space ? ' ' : '') + w.text).join('').replace(/^\(|\)$/g, '') : undefined,
    });
    (lines.at(-1) as any).agent = agent;
  }
  /* второй и следующие голоса — справа; если в песне один голос, всё слева */
  if (agents.length > 1) for (const l of lines as (LLine & { agent?: string })[]) l.side = l.agent === agents[0] ? 'left' : 'right';
  lines.sort((a, b) => a.t - b.t);
  return lines;
}

/* ---------- ответ сервера → модель ---------- */
export function fromServer(j: any, duration = 0): Lyrics {
  if (!j) return { lines: null, plain: null, source: null, sync: 'none' };
  let lines: LLine[] | null = null;
  if (j.ttml) { try { lines = parseTtml(j.ttml); } catch { lines = null; } }
  if ((!lines || !lines.length) && j.lrc) lines = parseLrc(j.lrc, duration);
  if ((!lines || !lines.length) && Array.isArray(j.synced) && j.synced.length) {
    lines = j.synced.map((l: { t: number; text: string }, i: number, a: { t: number }[]) => {
      const e = a[i + 1]?.t ?? l.t + 5;
      return { t: l.t, e, text: l.text, words: spreadWords(l.text, l.t, e), timedWords: false, side: 'left' as const };
    });
  }
  if (lines && !lines.length) lines = null;
  return { lines, plain: j.plain ?? null, source: j.source ?? null, sync: lines ? (lines.some((l) => l.timedWords) ? (j.sync === 'syllable' ? 'syllable' : 'word') : 'line') : 'none' };
}

/* ---------- запрос с кэшем ---------- */
const cache = new Map<string, Promise<Lyrics>>();
export function getLyrics(t: Track): Promise<Lyrics> {
  const hit = cache.get(t.id);
  if (hit) return hit;
  const p = (async () => {
    const body = { id: t.id, title: t.title, artists: [{ id: t.artistId, name: t.artist }], durationSec: t.duration };
    const r = await fetch(`${LULL_API}/api/lyrics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`lyrics ${r.status}`);
    return fromServer(await r.json(), t.duration);
  })();
  cache.set(t.id, p);
  p.catch(() => cache.delete(t.id));
  return p;
}

/** номер строки, которая звучит сейчас (-1 — до первой) */
export function activeLine(lines: LLine[], time: number): number {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (lines[m].t <= time + 0.15) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}
