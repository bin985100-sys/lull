import { app } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Простое хранилище ключ-значение: каждый ключ — отдельный JSON-файл в userData/data.
 * Запись с задержкой и атомарной заменой файла, чтобы не терять данные при падении.
 */
const dir = () => path.join(app.getPath('userData'), 'data');
const mem = new Map<string, unknown>();
const timers = new Map<string, NodeJS.Timeout>();

const safeKey = (key: string) => key.replace(/[^a-z0-9_-]/gi, '_');
const fileOf = (key: string) => path.join(dir(), `${safeKey(key)}.json`);

export function storeGet<T>(key: string): T | undefined {
  if (mem.has(key)) return mem.get(key) as T;
  try {
    const raw = fs.readFileSync(fileOf(key), 'utf8');
    const value = JSON.parse(raw) as T;
    mem.set(key, value);
    return value;
  } catch {
    return undefined;
  }
}

export function storeSet(key: string, value: unknown) {
  mem.set(key, value);
  clearTimeout(timers.get(key));
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      void write(key, value);
    }, 400)
  );
}

async function write(key: string, value: unknown) {
  await fsp.mkdir(dir(), { recursive: true });
  const file = fileOf(key);
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(value));
  await fsp.rename(tmp, file);
}

/** Сбросить все отложенные записи (перед выходом). */
export function flushStore() {
  for (const [key, t] of timers) {
    clearTimeout(t);
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(fileOf(key), JSON.stringify(mem.get(key)));
  }
  timers.clear();
}

export interface MainSettings {
  quality?: 'auto' | 'high' | 'low' | 'opus' | 'aac';
  lang?: string;
}

export const mainSettings = (): MainSettings => storeGet<MainSettings>('settings') ?? {};
