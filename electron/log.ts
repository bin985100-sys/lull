import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { format } from 'node:util';
import { BUILD } from '../shared/config';

/** Журнал в файл (player.log в папке данных) — чтобы ошибки можно было переслать, не копируя терминал. */
export const logDir = () => path.join(app.getPath('userData'), 'logs');

export function startFileLog() {
  try {
    fs.mkdirSync(logDir(), { recursive: true });
    const file = path.join(logDir(), 'player.log');
    // Не даём файлу расти бесконечно
    if (fs.existsSync(file) && fs.statSync(file).size > 2_000_000) fs.renameSync(file, `${file}.old`);
    const out = fs.createWriteStream(file, { flags: 'a' });
    // В режиме разработки дублируем журнал в папку проекта — так его проще переслать
    let dev: fs.WriteStream | null = null;
    if (!app.isPackaged) {
      try { fs.mkdirSync(path.join(process.cwd(), 'logs'), { recursive: true }); dev = fs.createWriteStream(path.join(process.cwd(), 'logs', 'player.log'), { flags: 'a' }); } catch { dev = null; }
    }
    console.log(`[app] сборка ${BUILD}, журнал: ${file}`);
    dev?.write(`\n===== запуск ${new Date().toISOString()} =====\n`);
    out.write(`\n===== запуск ${new Date().toISOString()} · v${app.getVersion()} =====\n`);
    for (const level of ['log', 'warn', 'error'] as const) {
      const orig = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        orig(...args);
        const line = `${new Date().toISOString().slice(11, 19)} ${level === 'log' ? '' : level.toUpperCase() + ' '}${format(...args)}\n`;
        out.write(line);
        dev?.write(line);
      };
    }
  } catch {
    /* журнал не критичен */
  }
}
