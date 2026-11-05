import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from './audius';

/* Небольшой кэш запросов: одинаковый ключ не грузится дважды за 5 минут. */
const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 5 * 60e3;

export type DataState<T> = { data: T | undefined; loading: boolean; error: ApiError | null; reload(): void };

export function useData<T>(key: string | null, fn: (signal: AbortSignal) => Promise<T>): DataState<T> {
  const hit = key ? cache.get(key) : undefined;
  const [state, setState] = useState<{ data: T | undefined; loading: boolean; error: ApiError | null }>({
    data: hit?.data as T | undefined,
    loading: !!key && !hit,
    error: null,
  });
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!key) { setState({ data: undefined, loading: false, error: null }); return; }
    const c = cache.get(key);
    if (c && Date.now() - c.at < TTL && nonce === 0) { setState({ data: c.data as T, loading: false, error: null }); return; }
    const ac = new AbortController();
    setState((s) => ({ data: c ? (c.data as T) : s.data, loading: true, error: null }));
    fnRef.current(ac.signal)
      .then((data) => { cache.set(key, { at: Date.now(), data }); if (!ac.signal.aborted) setState({ data, loading: false, error: null }); })
      .catch((e) => { if (!ac.signal.aborted) setState((s) => ({ data: s.data, loading: false, error: e instanceof ApiError ? e : new ApiError('http', String(e?.message || e)) })); });
    return () => ac.abort();
  }, [key, nonce]);

  const reload = useCallback(() => { if (key) cache.delete(key); setNonce((n) => n + 1); }, [key]);
  return { ...state, reload };
}

/* Сбросить кэш подборок после изменения настроек вкуса */
export function invalidate(prefix: string) { for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k); }
