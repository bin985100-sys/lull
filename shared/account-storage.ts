/** Supabase Auth uses a separate, bounded PKCE verifier slot for each flow. */
export const ACCOUNT_STORAGE_KEY_PATTERN = /^lull-account(?:-(?:user|provider|oauth-intent|code-verifier|flows-code-verifier|qa)|-flow-[a-zA-Z0-9_-]{8,64}-code-verifier)?$/;

export function assertAccountStorageKey(key: unknown): asserts key is string {
  if (typeof key !== 'string' || !ACCOUNT_STORAGE_KEY_PATTERN.test(key)) throw new Error('Invalid account storage key');
}
