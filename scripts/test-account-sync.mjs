import { build } from 'esbuild';
import assert from 'node:assert/strict';
const cache = new Map();
const tables = { lull_library_entries: new Map(), lull_user_state: new Map() };
let offline = false;
let visible;
const clone = value => value == null ? value : structuredClone(value);
const original = { storeGet: async key => clone(cache.get(key)), storeSet: async (key, value) => { cache.set(key, clone(value)); } };
const dbKey = row => JSON.stringify([row.user_id, row.collection, row.item_id, row.key]);
const db = {
  from: table => ({
    select: () => {
      const q = {
        uid: '', eq(_key, uid) { this.uid = uid; return this; }, order() { return this; },
        async range(from, to) { return this.result(from, to); },
        result(from = 0, to = Infinity) { return offline ? { error: new Error('Offline'), data: null } : { error: null, data: [...tables[table].values()].filter(r => r.user_id === this.uid).slice(from, to + 1).map(clone) }; },
        then(resolve, reject) { return Promise.resolve(this.result()).then(resolve, reject); }
      }; return q;
    },
    upsert: async rows => {
      if (offline) return { error: new Error('Offline') };
      rows.forEach(row => tables[table].set(dbKey(row), clone(row)));
      return { error: null };
    }
  }),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: async () => {}
};
globalThis.window = new EventTarget();
globalThis.__fixture = { api: { ...original }, db, setLibrary: value => { visible = clone(value); } };
await build({ entryPoints: ['src/account/sync.ts'], outfile: 'work/account-sync.mjs', bundle: true, format: 'esm', platform: 'node', plugins: [{ name: 'sync-boundaries', setup(b) {
  b.onResolve({ filter: /^(\.\/client|\.\.\/api|\.\.\/store\/library)$/ }, a => a.importer.endsWith('sync.ts') ? ({ path: a.path, namespace: 'fixture' }) : undefined);
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path === './client' ? 'export const cloud=globalThis.__fixture.db' : a.path === '../api' ? 'export const api=globalThis.__fixture.api' : 'export const useLibrary={setState:globalThis.__fixture.setLibrary}' }));
} }] });
const { startSync } = await import('../work/account-sync.mjs');
const track = id => ({ id, title: id, artists: [{ name: 'Artist' }] });
const initial = { likes: [{ track: track('a'), addedAt: 1 }], playlists: [], saved: [], history: [], stats: {} };
cache.set('library', initial);
let sync = await startSync('alice');
assert.equal(visible.likes[0].track.id, 'a', 'First account imports the guest library');
await __fixture.api.storeSet('recentSearches', ['private search']);
offline = true;
await __fixture.api.storeSet('library', { ...initial, likes: [] });
await sync.flush(); sync.stop();
assert.equal(cache.get('account_alice_outbox')[0].deleted, true, 'Offline removal survives process restart');
Object.assign(__fixture.api, original);
offline = false;
const add = { user_id: 'alice', collection: 'likes', item_id: 'b', value: { track: track('b'), addedAt: 2 }, deleted: false };
tables.lull_library_entries.set(dbKey(add), add);
sync = await startSync('alice');
assert.deepEqual(visible.likes.map(v => v.track.id), ['b'], 'Reconnection preserves another device addition while applying the offline removal');
sync.stop(); Object.assign(__fixture.api, original);
sync = await startSync('bob');
assert.deepEqual(visible.likes, [], 'Second account does not inherit the first account or guest library');
assert.equal(await __fixture.api.storeGet('recentSearches'), undefined, 'Search history is account-local too');
assert.equal(tables.lull_library_entries.size, 2);
sync.stop();
console.log('Account sync: offline durable deletion, restart, concurrent remote add and account switching passed');
