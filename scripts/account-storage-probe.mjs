import { createClient } from '@supabase/supabase-js';

/** Runs against a fresh test profile's real native storage; never opens a provider. */
export async function runAccountStorageProbe(adapter) {
  const original = new Map(), written = [];
  const storage = {
    getItem: key => adapter.getItem(key),
    setItem: async (key, value) => {
      if (!original.has(key)) original.set(key, await adapter.getItem(key));
      written.push(key);
      await adapter.setItem(key, value);
    },
    removeItem: key => adapter.removeItem(key)
  };
  const client = createClient('https://lull-auth-test.invalid', 'fixture-publishable-key', {
    auth: { storageKey: 'lull-account', storage, flowType: 'pkce', autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async () => { throw new Error('This storage probe must not send any network request'); } }
  });
  const check = (value, message) => { if (!value) throw new Error(message); };
  try {
    for (const provider of ['google', 'discord']) {
      const { data, error } = await client.auth.signInWithOAuth({provider, options: {redirectTo:'lull://auth/callback', skipBrowserRedirect:true}});
      if (error) throw error;
      const url = new URL(data.url);
      check(url.searchParams.get('provider') === provider, 'Wrong provider URL');
      check(url.searchParams.get('code_challenge_method') === 's256', 'PKCE must remain enabled');
      const slot = written.filter(key => /^lull-account-flow-[a-zA-Z0-9_-]{8,64}-code-verifier$/.test(key)).at(-1);
      check(slot, 'Actual SDK did not create a per-flow verifier slot');
      const verifier = JSON.parse(await adapter.getItem(slot));
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
      const encoded = btoa(String.fromCharCode(...hash)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      check(url.searchParams.get('code_challenge') === encoded, 'Encrypted verifier roundtrip does not match the authorization challenge');
    }
    const slots = [...new Set(written.filter(key => /^lull-account-flow-/.test(key)))];
    check(slots.length === 2, 'Google and Discord must have independent verifier slots');
    const index = JSON.parse(await adapter.getItem('lull-account-flows-code-verifier'));
    check(index.length === 2, 'Actual SDK flow index could not be read');
    for (const key of ['../lull-account', 'lull-account/../../outside', 'lull-account-flow-1234567-code-verifier', 'lull-account-flow-'+ '1'.repeat(65) +'-code-verifier', 'other-account']) {
      let refused = false;
      try { await adapter.setItem(key, 'must-not-be-saved'); } catch { refused = true; }
      check(refused, 'Native storage accepted an unrelated or unsafe key');
    }
    return {providers:['google','discord'],pkceSlots:slots.length,encryptedRoundtrip:true,unsafeKeysRejected:5};
  } finally {
    for (const [key, value] of [...original].reverse()) {
      if (value === null) await adapter.removeItem(key); else await adapter.setItem(key,value);
    }
    client.auth.dispose();
  }
}
