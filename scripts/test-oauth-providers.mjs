import { build } from 'esbuild';
import assert from 'node:assert/strict';
const values = new Map();
let requested;
let session = { user: { id: 'owner', app_metadata: { provider: 'discord' }, identities: [{ provider: 'discord' }, { provider: 'google' }] }, provider_token: 'google-fixture' };
globalThis.window = { api: { accountStorage: { get: async k => values.get(k) ?? null, set: async (k, v) => v === null ? values.delete(k) : values.set(k, v) }, openExternal: async () => {} } };
globalThis.location = { origin: 'https://app.lull.website' };
globalThis.__oauthFixture = { auth: {
  signInWithOAuth: async request => { requested = request; return { data: { url: 'https://example.invalid/oauth' } }; },
  linkIdentity: async request => { requested = request; return { data: { url: 'https://example.invalid/link' } }; },
  exchangeCodeForSession: async () => ({ data: { session } })
} };
await build({ entryPoints: ['src/account/client.ts'], outfile: 'work/oauth-providers.mjs', bundle: true, format: 'esm', platform: 'node',
  define: { 'import.meta.env.VITE_ACCOUNTS_ENABLED': '"true"', 'import.meta.env.VITE_SUPABASE_URL': '"https://example.invalid"', 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '"fixture"' },
  plugins: [{ name: 'oauth-boundaries', setup(b) {
    b.onResolve({ filter: /^(@supabase\/supabase-js|@capacitor\/core)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path.includes('supabase') ? 'export const createClient=()=>globalThis.__oauthFixture' : 'export const Capacitor={isNativePlatform:()=>false};export const registerPlugin=()=>({})' }));
  } }]
});
const { signIn, acceptCallback, sessionProvider, waitForAccountCallback } = await import('../work/oauth-providers.mjs');
assert.equal(await sessionProvider(session), null, 'Primary Discord identity does not identify a linked session token');
await signIn('google', true);
assert.ok(requested.options.scopes.includes('youtube.readonly'));
const callback = acceptCallback('lull://auth/callback?code=fixture-google');
await waitForAccountCallback();
assert.equal(await sessionProvider(session), 'google', 'Google linking binds the returned token, even with Discord as primary identity');
await callback;
await signIn('discord');
assert.equal(requested.options.scopes, 'identify email');
assert.equal(requested.options.queryParams, undefined);
session = { ...session, provider_token: 'discord-fixture' };
await acceptCallback('lull://auth/callback?code=fixture-discord');
assert.equal(await sessionProvider(session), 'discord');
assert.equal(await sessionProvider({ ...session, user: { ...session.user, id: 'different-owner' } }), null, 'Token ownership cannot cross accounts');
assert.equal(await sessionProvider({ ...session, provider_token: 'unbound-token' }), null, 'A different token cannot inherit provider ownership');
assert.equal(await sessionProvider({ ...session, provider_token: null }), null);
await assert.rejects(acceptCallback('https://foreign.invalid/auth/callback?code=fixture'));
console.log('OAuth providers: Google linking, Discord scope isolation, token/provider binding, account isolation and callback validation passed');
