/* Тесты разбора текстов песен (тексты в примерах выдуманные). Запуск: node scripts/lyrics.test.mjs */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lull-lyr-')), 'l.mjs');
await esbuild.build({
  stdin: { contents: `export * from '@/api/lyrics';`, resolveDir: mobile, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
  plugins: [{ name: 'a', setup(b) {
    b.onResolve({ filter: /^@\// }, (a) => ({ path: path.join(mobile, 'src', a.path.slice(2)) + '.ts' }));
    b.onResolve({ filter: /^\.\/lull$/ }, () => ({ path: 'lull', namespace: 's' }));
    b.onLoad({ filter: /.*/, namespace: 's' }, () => ({ contents: 'export const LULL_API="http://x"', loader: 'js' }));
  } }],
});
const L = await import(out);

let pass = 0, fail = 0;
const test = (n, f) => { try { f(); pass++; console.log('✓', n); } catch (e) { fail++; console.log('✗', n, '\n   ', e.message); } };
const eq = (a, b, w) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${w}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
const near = (a, b, w) => { if (Math.abs(a - b) > 0.011) throw new Error(`${w}: ${a} ≠ ${b}`); };

test('Время: секунды, мм:сс, чч:мм:сс, с суффиксом s', () => {
  near(L.parseTime('12.5'), 12.5, 'a'); near(L.parseTime('1:02.25'), 62.25, 'b'); near(L.parseTime('00:01:02.500'), 62.5, 'c'); near(L.parseTime('3.2s'), 3.2, 'd');
});

test('LRC по строкам: время, конец строки = начало следующей, слова разложены по строке', () => {
  const ls = L.parseLrc('[ar:x]\n[00:01.00]Первая строка тут\n[00:04.50]Вторая\n', 10);
  eq(ls.map((l) => l.text), ['Первая строка тут', 'Вторая'], 'текст');
  near(ls[0].e, 4.5, 'конец первой');
  eq(ls[0].words.map((w) => w.text), ['Первая', 'строка', 'тут'], 'слова');
  if (ls[0].timedWords) throw new Error('это оценка, а не настоящий тайминг');
  if (!(ls[0].words[1].t > ls[0].words[0].t && ls[0].words[2].e <= 4.5 + 1e-9)) throw new Error('слова вне строки');
});

test('LRC: одна строка с несколькими метками (припев) повторяется', () => {
  const ls = L.parseLrc('[00:10.00][00:30.00]Припев\n[00:20.00]Куплет', 40);
  eq(ls.map((l) => [l.t, l.text]), [[10, 'Припев'], [20, 'Куплет'], [30, 'Припев']], 'порядок');
});

test('Расширенный LRC с метками слов <мм:сс.xx>', () => {
  const ls = L.parseLrc('[00:05.00]<00:05.00> Свет <00:05.60> над <00:06.10> рекой\n[00:08.00]дальше', 20);
  eq(ls[0].words.map((w) => [w.text, w.t]), [['Свет', 5], ['над', 5.6], ['рекой', 6.1]], 'слова');
  eq(ls[0].timedWords, true, 'настоящий тайминг');
  eq(ls[0].text, 'Свет над рекой', 'строка');
});

const ttml = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><body><div>
<p begin="1.0" end="3.0" ttm:agent="v1"><span begin="1.0" end="1.4">Ночь</span> <span begin="1.5" end="1.8">го</span><span begin="1.8" end="2.2">рит</span><span ttm:role="x-bg"><span begin="2.3" end="2.9">(горит)</span></span></p>
<p begin="00:03.200" end="00:05.000" ttm:agent="v2"><span begin="3.2" end="3.6">Я</span> <span begin="3.7" end="4.4">рядом</span></p>
<p begin="5.2" end="6" ttm:agent="v1"><span begin="5.2" end="6">Тише &amp; ближе</span></p>
</div></body></tt>`;

test('TTML: слоги склеиваются в слова, пробел разделяет слова', () => {
  const ls = L.parseTtml(ttml);
  eq(ls[0].words.map((w) => w.text), ['Ночь', 'горит'], 'слова');
  near(ls[0].words[1].t, 1.5, 'начало слова'); near(ls[0].words[1].e, 2.2, 'конец слова = конец последнего слога');
  eq(ls[0].text, 'Ночь горит', 'строка');
});

test('TTML: подпевка отдельно и без скобок', () => { eq(L.parseTtml(ttml)[0].bg, 'горит', 'бэк-вокал'); });

test('TTML: второй голос — справа, первый — слева (дуэт)', () => { eq(L.parseTtml(ttml).map((l) => l.side), ['left', 'right', 'left'], 'стороны'); });

test('TTML: формат времени чч:мм:сс и сущности &amp;', () => {
  const ls = L.parseTtml(ttml); near(ls[1].t, 3.2, 'время'); eq(ls[2].text, 'Тише & ближе', 'текст');
});

test('TTML с одним голосом — всё слева', () => {
  const ls = L.parseTtml('<p begin="1" end="2"><span begin="1" end="2">раз</span></p><p begin="2" end="3"><span begin="2" end="3">два</span></p>');
  eq(ls.map((l) => l.side), ['left', 'left'], 'стороны');
});

test('Ответ сервера: TTML важнее LRC; без синхронизации — простой текст', () => {
  const a = L.fromServer({ ttml, lrc: '[00:01.00]x', plain: 'p', source: 'betterlyrics', sync: 'syllable' }, 10);
  eq([a.lines.length, a.sync], [3, 'syllable'], 'ttml');
  const b = L.fromServer({ synced: [{ t: 1, text: 'a b' }, { t: 3, text: 'c' }], plain: 'a b\nc', source: 'lrclib' }, 10);
  eq([b.lines.length, b.sync, b.lines[0].e], [2, 'line', 3], 'synced');
  const c = L.fromServer({ synced: null, plain: 'только текст', source: 'youtube' });
  eq([c.lines, c.plain, c.sync], [null, 'только текст', 'none'], 'plain');
  eq(L.fromServer(null).sync, 'none', 'пусто');
});

test('Активная строка: до первой -1, за 0.15 с до строки она уже активна', () => {
  const ls = L.parseLrc('[00:02.00]a\n[00:05.00]b\n[00:09.00]c', 12);
  eq([L.activeLine(ls, 0), L.activeLine(ls, 2), L.activeLine(ls, 4.8), L.activeLine(ls, 5), L.activeLine(ls, 100)], [-1, 0, 0, 1, 2], 'индексы');
});

console.log(`\n${pass} прошло, ${fail} упало`);
process.exit(fail ? 1 : 0);
