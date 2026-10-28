# Lull accounts

Project: `sluzyoctsnncbwfqybca` (Frankfurt). Migrations and owner-isolation checks are in this directory.

The client uses only the public publishable key. Never put service-role keys or a Google client secret in Vite variables, APKs or desktop bundles.

## Remaining external setup

Create a Google Cloud OAuth **Web application** client for Supabase, configure consent, and add this exact authorized redirect URI:

`https://sluzyoctsnncbwfqybca.supabase.co/auth/v1/callback`

Configure the client ID and secret in Supabase → Authentication → Sign In / Providers → Google. No email/password sign-in is enabled. Google requests `youtube.readonly`; this grants supported YouTube Data API access, not unrestricted YouTube Music access. Consent/testing-user restrictions and any Google verification requirements must be satisfied before public rollout.

Enable YouTube Data API v3 in the same Google Cloud project. After the first login, the app imports liked music videos (category 10, up to the API's latest 1,000-item limit) and music videos in owned playlists through the official API. Private items unavailable to the API, saved playlists owned by other channels and generated YouTube Music mixes are not covered. Import never deletes Lull data; a per-account marker prevents automatic repeated imports. An expired Google provider token requires a fresh Google consent flow to import again; the Lull account/library itself continues to use its own Supabase session.

Supabase redirect allowlist includes `https://app.lull.website/auth/callback` and `lull://auth/callback`. The web server must serve the application shell at `/auth/callback`. Desktop and Android register the custom protocol. Login opens in the system browser, uses PKCE and exchanges the code through Supabase. Desktop sessions are encrypted with Electron safeStorage; Android uses an Android Keystore AES-GCM key and excludes app data from backups. Web sessions use the browser's origin-local storage.

Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and, **after end-to-end verification**, `VITE_ACCOUNTS_ENABLED=true` for all build jobs. The account gate is disabled in existing builds until the provider is configured; enabling it earlier would lock everyone out. Fixture-only development mode remains separate from production web builds.

## Data handling

Library rows are per item with tombstones. A local durable outbox retries failed writes, and only locally observed changes are sent: an older device cannot delete an unseen remote addition. Listening totals use independent device shards. Queue state is saved periodically and restored without automatically starting sound on another device. Preferences exclude relay credentials, output devices and machine-specific integration settings. Library and local outboxes are namespaced by user; the old guest library is claimed once by the first account on each installation. Sign-out reloads the app to clear in-memory stores.

Realtime notifications plus periodic/online refresh retry synchronization. Database policies reject anonymous access and cross-account reads/writes. Run `node scripts/test-account-library.mjs`, TypeScript checks and `supabase/tests/owner_isolation.sql` in addition to real multi-device login and playback checks before releasing account-enabled builds.
