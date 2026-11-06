import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

// Cache only completed files. A partial Android download must never reach Media3.
const MAX_BYTES = 120 * 1024 * 1024;
let dir: Directory | undefined;
let running = false;
const queue = new Map<string, string>();
const used = new Map<string, number>();
let pins = new Set<string>();

function directory() {
  if (!dir) {
    dir = new Directory(Paths.cache, 'lull-audio-v1');
    dir.create({ intermediates: true, idempotent: true });
    for (const entry of dir.list()) if (entry instanceof File && entry.name.endsWith('.part')) entry.delete();
  }
  return dir;
}

export function localAudio(id: string): string | undefined {
  if (Platform.OS === 'web' || !/^[A-Za-z0-9_-]{11}$/.test(id)) return;
  try {
    const f = new File(directory(), `${id}.m4a`);
    if (f.exists && f.size > 10000) { used.set(id, Date.now()); return f.uri; }
  } catch {}
}

export function pinAudio(ids: string[]) { pins = new Set(ids); }

function trim() {
  const files = directory().list().filter((f): f is File => f instanceof File && f.name.endsWith('.m4a'));
  let bytes = files.reduce((n, f) => n + f.size, 0);
  files.sort((a, b) => (used.get(a.name.slice(0,-4)) || a.modificationTime || 0) - (used.get(b.name.slice(0,-4)) || b.modificationTime || 0));
  for (const f of files) {
    if (bytes <= MAX_BYTES) break;
    const id = f.name.slice(0,-4);
    if (pins.has(id)) continue;
    const size = f.size;
    f.delete(); used.delete(id); bytes -= size;
  }
}

export function prefetchAudio(id: string, url: string) {
  if (Platform.OS === 'web' || !/^[A-Za-z0-9_-]{11}$/.test(id) || localAudio(id)) return;
  if (queue.size >= 8) return;
  queue.set(id, url);
  void drain();
}

async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.size) {
      const [id, url] = queue.entries().next().value!;
      queue.delete(id);
      if (localAudio(id)) continue;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 30000);
      let part: File | undefined;
      try {
        part = new File(directory(), `${id}.part`);
        await File.downloadFileAsync(url, part, { idempotent: true, signal: ac.signal,
          onProgress: ({ bytesWritten }) => { if (bytesWritten > 25 * 1024 * 1024) ac.abort(); } });
        if (part.size <= 10000 || part.size > 25 * 1024 * 1024) throw new Error('invalid audio size');
        await part.move(new File(directory(), `${id}.m4a`));
        part = undefined;
        used.set(id, Date.now());
        trim();
      } catch {
        try { if (part?.exists) part.delete(); } catch {}
      } finally { clearTimeout(timer); }
    }
  } finally { running = false; }
}
