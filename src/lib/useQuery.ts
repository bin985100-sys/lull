import { useEffect, useState } from 'react';

/** Мини-кеш запросов: при возврате на страницу данные показываются мгновенно, затем обновляются. */
const cache = new Map<string, { data: unknown; at: number }>();
const TTL = 5 * 60 * 1000;

export function useQuery<T>(key: string | null, fn: () => Promise<T>) {
  const hit = key ? (cache.get(key) as { data: T; at: number } | undefined) : undefined;
  const [data, setData] = useState<T | undefined>(hit?.data);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!hit && !!key);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    const cached = cache.get(key) as { data: T; at: number } | undefined;
    setData(cached?.data);
    setError(null);
    if (cached && Date.now() - cached.at < TTL && nonce === 0) {
      setLoading(false);
      return;
    }
    setLoading(!cached);
    fn()
      .then((d) => {
        if (!alive) return;
        cache.set(key, { data: d, at: Date.now() });
        setData(d);
      })
      .catch((e: Error) => alive && setError(e?.message ?? 'Ошибка загрузки'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // fn намеренно не в зависимостях — ключ однозначно определяет запрос
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  return { data, error, loading, reload: () => setNonce((n) => n + 1) };
}

/** Сбросить кеш (например, после входа в аккаунт — данные становятся личными). */
export function invalidateQueries() {
  cache.clear();
}
