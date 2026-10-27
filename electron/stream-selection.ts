/** Only the selected source may update the stream cache. A slower resolver can
 * return a different codec/file after playback has already started.
 */
export async function selectStream<T>(candidates: Promise<T>[], remember: (stream: T) => void): Promise<T> {
  const selected = await Promise.any(candidates);
  remember(selected);
  return selected;
}

export function isVideoUnavailable(message: string): boolean {
  if (/requested format.*not available|no video formats found/i.test(message)) return false;
  return /Video unavailable|not available|Private video|removed|blocked it in your country|This video has been/i.test(message);
}

/** Give the primary source a short head start, rather than waiting for all of
 * its retries before trying an already-supported matching audio source.
 */
export async function firstPlayable<T>(primary: Promise<T>, fallback: () => Promise<T | null>, delayMs = 1000): Promise<T> {
  let startFallback!: () => void;
  let started = false;
  const alternate = new Promise<T>((resolve, reject) => {
    startFallback = () => {
      if (started) return;
      started = true;
      Promise.resolve().then(fallback).then((value) => {
        if (value === null) reject(new Error('Matching fallback audio not found'));
        else resolve(value);
      }, reject);
    };
  });
  const timer = setTimeout(startFallback, delayMs);
  const original = primary.catch((error) => {
    clearTimeout(timer);
    startFallback();
    throw error;
  });
  try {
    return await Promise.any([original, alternate]);
  } catch {
    // Keep the original diagnostic rather than exposing an AggregateError.
    return await original;
  } finally {
    clearTimeout(timer);
  }
}
