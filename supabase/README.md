# Lull accounts

Project: `sluzyoctsnncbwfqybca` (Frankfurt). Migrations and owner-isolation checks are in this directory.

The client uses only the public publishable key. Never put service-role keys or a Google client secret in Vite variables, APKs or desktop bundles.

## Remaining external setup

Create a Google Cloud OAuth **Web application** client for Supabase, configure consent, and add this exact authorized redirect URI:

`https://sluzyoctsnncbwfqybca.supabase.co/auth/v1/callback`

Configure the client ID and secret in Supabase → Authentication → Sign In / Providers → Google. No email/password sign-in is enabled. Google requests `youtube.readonly`; this grants supported YouTube Data API access, not unrestricted YouTube Music access. Consent/testing-user restrictions and any Google verification requirements must be satisfied before public rollout.

YouTube Data API v3 is enabled. After the first login, the app imports liked music videos (category 10, up to the API's latest 1,000-item limit) and music videos in owned playlists through the official API. Private items unavailable to the API, saved playlists owned by other channels and generated YouTube Music mixes are not covered. Import never deletes Lull data; a per-account marker prevents automatic repeated imports.

The `lull-youtube` Edge Function stores provider credentials in Supabase Vault and refreshes Google access independently of Supabase sessions. It validates the live Lull user, checks the Google subject against linked identities, and proxies only three read-only YouTube endpoints. Provider credentials never return to the browser. The connection table and credential RPCs deny anon/authenticated access; only the function's service role can read them. CAS revisions prevent an old refresh overwriting a newer sign-in. Revoked Google consent requires reauthorization; ordinary Supabase token refresh no longer implies a lost YouTube connection.

Set `LULL_GOOGLE_CLIENT_ID` and the actual `LULL_GOOGLE_CLIENT_SECRET` only in this project's Edge Function secrets. Management API auth configuration returns the existing secret as a SHA-256 digest, which is not a usable OAuth secret. An additional Google client secret is required if the original was not retained. The function rejects missing/digest-only configuration. Keep gateway `verify_jwt=true` and the handler's live Auth user check. Run `node scripts/test-google-connection.mjs` and check the deployed function, private Vault/RPC privileges and actual Google refresh before claiming this path is ready.

Supabase redirect allowlist includes `https://app.lull.website/auth/callback` and `lull://auth/callback`. The web server must serve the application shell at `/auth/callback`. Desktop and Android register the custom protocol. Login opens in the system browser, uses PKCE and exchanges the code through Supabase. Desktop sessions are encrypted with Electron safeStorage; Android uses an Android Keystore AES-GCM key and excludes app data from backups. Web sessions use the browser's origin-local storage.

Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and, **after end-to-end verification**, `VITE_ACCOUNTS_ENABLED=true` for all build jobs. Provider entry in Settings and restored-session synchronization are available whenever cloud configuration exists, independently of whether login is mandatory. The mandatory gate is disabled until public Google requirements and provider callbacks are verified; enabling it earlier would lock everyone out. Fixture-only development mode remains separate from production web builds.

Discord is an alternative OAuth sign-up/sign-in provider (no password form). Create a Discord application and register the same Supabase callback, then enable Discord in Supabase with its client ID and secret. Keep all provider secrets in Supabase, never in Vite variables or native packages. Enable manual identity linking so an authenticated Discord account can connect Google even when its Google email differs. Existing accounts with the same verified email follow Supabase's automatic identity linking rules.

Google login requests YouTube read-only consent in the same flow and starts the import automatically after application boot. Discord login does not request or imply YouTube access: users may explicitly connect Google from their account. Linked accounts retain the Lull user ID and library. OAuth callback handling binds the provider token hash to the provider and user; the primary `app_metadata.provider` alone does not identify a linked account's current token. Discord tokens must never be sent to Google APIs. This connection imports the supported YouTube library; it does not grant unrestricted YouTube Music streaming or bypass source availability.

Provisioned Google Cloud project: `lull-513010`, OAuth Web client `Lull`. Google provider is enabled in Supabase. The consent app remains in Testing with the owner email registered; public rollout requires complete branding, required scopes/API enablement and Google's applicable verification. Do not enable the mandatory production gate based only on provider configuration or fixture tests.

## Data handling

Library rows are per item with tombstones. A local durable outbox retries failed writes, and only locally observed changes are sent: an older device cannot delete an unseen remote addition. Listening totals use independent device shards. Queue state is saved periodically and restored without automatically starting sound on another device. Preferences exclude relay credentials, output devices and machine-specific integration settings. Library and local outboxes are namespaced by user; the old guest library is claimed once by the first account on each installation. Sign-out reloads the app to clear in-memory stores.

Realtime notifications plus periodic/online refresh retry synchronization. Database policies reject anonymous access and cross-account reads/writes. Run `node scripts/test-account-library.mjs`, TypeScript checks and `supabase/tests/owner_isolation.sql` in addition to real multi-device login and playback checks before releasing account-enabled builds.
