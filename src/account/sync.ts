import { create } from 'zustand';
import { api } from '../api';
import { cloud } from './client';
import { addStats, diff, emptyLibrary, entryKey, expand, flatten, statsDelta, type Entry } from './library';
import type { LibraryData, MonthStats } from '../store/library';

export const useSyncStatus = create<{ status: string }> (() => ({ status: 'Подключаем библиотеку…' }));
const stateKeys: Record<string, string> = { queue: 'queue', settings: 'preferences', lyricPrefs2: 'lyrics', wave: 'wave' };
const preferences = new Set(['autoplay','gapless','crossfade','quality','normalize','eqEnabled','eqPreset','eqGains','background','speed','pitch','animatedBg','doubleClick','restoreQueue','uiSounds','waveIntro','lang']);
const publicSettings = (v: unknown) => Object.fromEntries(Object.entries((v ?? {}) as object).filter(([k]) => preferences.has(k)));
const status = (message: string) => useSyncStatus.setState({ status: message });

/** Account-local durable outbox; retries never discard a newer local edit. */
export async function startSync(userId: string) {
  if (!cloud) throw new Error('Cloud is not configured');
  const db = cloud;
  const get = api.storeGet.bind(api), set = api.storeSet.bind(api);
  const local = (key: string) => `account_${userId}_${key}`;
  let device = await get<string>('account_device');
  if (!device) { device = crypto.randomUUID(); await set('account_device', device); }
  const deviceId = device;
  const pending = new Map<string, Entry>((await get<Entry[]>(local('outbox')) ?? []).map((v) => [entryKey(v), v]));
  const statePending = new Map<string, unknown>(Object.entries(await get<Record<string, unknown>>(local('state_outbox')) ?? {}));
  let library = await get<LibraryData>(local('library'));
  const importedBy = await get<string>('account_legacy_owner');
  if (!library) {
    library = !importedBy ? await get<LibraryData>('library') : undefined;
    if (!importedBy) await set('account_legacy_owner', userId);
    library ??= emptyLibrary();
    // Claim the old local library once. Existing server rows (including tombstones) win.
    await set(local('migration'), library);
    await set(local('library'), library);
  }
  let view = library;
  let rows = new Map<string, Entry>();
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let localWrite = Promise.resolve();
  const saveOutbox = async () => {
    await set(local('outbox'), [...pending.values()]);
    await set(local('state_outbox'), Object.fromEntries(statePending));
  };
  const later = () => { clearTimeout(timer); if (!stopped) timer = setTimeout(() => void sync(), 800); };

  api.storeGet = async <T,>(key: string): Promise<T | undefined> => {
    if (key === 'recentSearches') return get<T>(local(key));
    if (key === 'library') return structuredClone(view) as T;
    if (key in stateKeys) {
      const value = await get<T>(local(key));
      // Relay credentials and output devices remain on this device only.
      if (key === 'settings') return { ...(await get<object>('settings')), ...value } as T;
      return value;
    }
    return get<T>(key);
  };
  api.storeSet = (key, value) => {
    if (key === 'recentSearches') return set(local(key), value);
    if (key !== 'library' && !(key in stateKeys)) return set(key, value);
    // Snapshot immediately; callers often pass mutable arrays from their stores.
    const snapshot = structuredClone(value);
    localWrite = localWrite.then(async () => {
      if (key === 'library') {
        const next = snapshot as LibraryData;
        for (const row of diff(flatten(view), flatten(next))) pending.set(entryKey(row), row);
        for (const [month, stats] of Object.entries(next.stats)) {
          const delta = statsDelta(view.stats[month], stats);
          if (!delta.sec && !Object.keys(delta.plays).length) continue;
          const id = JSON.stringify([month, deviceId]);
          const identity = { collection: 'stats', item_id: id };
          const old = pending.get(entryKey(identity)) ?? rows.get(entryKey(identity));
          const own = (old?.value as { stats?: MonthStats } | undefined)?.stats;
          const row: Entry = { ...identity, value: { month, stats: addStats(own, delta) }, deleted: false };
          pending.set(entryKey(row), row);
        }
        view = next;
      } else statePending.set(stateKeys[key], key === 'settings' ? publicSettings(snapshot) : snapshot);
      if (key === 'settings') {
        const native = snapshot as Record<string, unknown>;
        const current = await get<Record<string, unknown>>('settings') ?? {};
        for (const key of ['quality', 'lang', 'relay', 'relayOn', 'discordRpc', 'discordClientId']) if (key in native) current[key] = native[key];
        await set('settings', current);
      }
      await set(local(key), snapshot);
      await saveOutbox(); later();
    });
    return localWrite;
  };

  async function sync() {
    if (stopped) return;
    if (running) return running;
    running = (async () => {
      await localWrite;
      status('Синхронизация…');
      // Fetch every page: Supabase defaults to at most 1,000 rows.
      const remote = new Map<string, Entry>();
      for (let from = 0; ; from += 500) {
        const { data, error } = await db.from('lull_library_entries').select('collection,item_id,value,deleted').eq('user_id', userId).order('collection').order('item_id').range(from, from + 499);
        if (error) throw error;
        for (const row of data as Entry[]) remote.set(entryKey(row), row);
        if (data.length < 500) break;
      }
      const migration = await get<LibraryData>(local('migration'));
      if (migration) {
        for (const [key, row] of flatten(migration)) if (!remote.has(key) && !pending.has(key)) pending.set(key, row);
        for (const [month, stats] of Object.entries(migration.stats)) {
          const row: Entry = { collection: 'stats', item_id: JSON.stringify([month, 'legacy', deviceId]), value: { month, stats }, deleted: false };
          if (!remote.has(entryKey(row))) pending.set(entryKey(row), row);
        }
        await saveOutbox();
        await set(local('migration'), null);
      }
      const sending = [...pending.values()];
      // Commit in bounded batches; leave the durable outbox intact on failure.
      for (let i = 0; i < sending.length; i += 100) {
        const batch = sending.slice(i, i + 100);
        const { error } = await db.from('lull_library_entries').upsert(batch.map((row) => ({ ...row, user_id: userId })), { onConflict: 'user_id,collection,item_id' });
        if (error) throw error;
        for (const row of batch) {
          remote.set(entryKey(row), row);
          if (pending.get(entryKey(row)) === row) pending.delete(entryKey(row));
        }
      }
      rows = remote;
      await localWrite;
      for (const [key, row] of pending) remote.set(key, row);
      view = expand(remote.values());
      await set(local('library'), view);
      const { useLibrary } = await import('../store/library');
      useLibrary.setState(view);

      const stateBatch = [...statePending];
      if (stateBatch.length) {
        const { error } = await db.from('lull_user_state').upsert(stateBatch.map(([key, value]) => ({ user_id: userId, key, value, device_id: deviceId })), { onConflict: 'user_id,key' });
        if (error) throw error;
        for (const [key, value] of stateBatch) if (statePending.get(key) === value) statePending.delete(key);
      }
      const { data: states, error } = await db.from('lull_user_state').select('key,value,device_id').eq('user_id', userId);
      if (error) throw error;
      for (const row of states) {
        if (statePending.has(row.key)) continue;
        const key = Object.keys(stateKeys).find((k) => stateKeys[k] === row.key);
        if (!key) continue;
        if (key === 'settings') await set(local(key), { ...(await get<object>(local(key))), ...publicSettings(row.value) });
        else await set(local(key), row.value);
        // Restore on the next app launch; never swap the visible queue under
        // a loaded decoder, including when that decoder is currently paused.
      }
      await saveOutbox();
      status('Библиотека синхронизирована');
    })().catch(() => status('Изменения сохранены на устройстве. Повторим синхронизацию.')).finally(() => { running = undefined; if (pending.size || statePending.size) later(); });
    return running;
  }

  await sync();
  const channel = db.channel(`library-${userId}-${deviceId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'lull_library_entries', filter: `user_id=eq.${userId}` }, later)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lull_user_state', filter: `user_id=eq.${userId}` }, later).subscribe();
  const online = () => void sync();
  window.addEventListener('online', online);
  const poll = setInterval(online, 30_000);
  return {
    flush: async () => { await localWrite; await sync(); },
    stop: () => { stopped = true; clearTimeout(timer); clearInterval(poll); window.removeEventListener('online', online); void db.removeChannel(channel); }
  };
}
