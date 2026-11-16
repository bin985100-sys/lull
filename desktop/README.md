# Lull Desktop 1.1

Connected desktop client for `https://app.lull.website`. It uses the same catalog,
account and server audio preparation as the current mobile/web app. Changes to
the web UI appear without reinstalling the desktop runtime.

This client does not package the older desktop DSP, Discord integration, local
download manager or offline web shell. Existing data from the older desktop
client is not deleted; this renderer has a separate persistent browser partition.
Internet is required. Mobile Android offline downloads remain in the native app.

Build from the repository root after `npm ci --ignore-scripts`:

```
node node_modules/electron-builder/out/cli/cli.js --projectDir desktop --config electron-builder.yml --win --x64 --arm64 --publish never
```

Use `--mac` or `--linux` on the matching CI host. Artifacts go to
`release-desktop/`. Builds currently have no developer code-signing identity.
The workflow does not publish a release automatically: artifacts are verified
before the download links on the website are replaced.

Renderer: sandbox enabled, Node disabled, no preload/IPC bridge. Main-window
navigation is restricted to the Lull web origin. External HTTP(S) links open in
the system browser. Device permissions are denied except media key-system access.

Layout QA uses actual viewport dimensions (264–1920 logical pixels), portrait,
landscape and window resizing. This does not replace testing on physical folding
devices, iPhones or every operating-system version. Native iOS distribution still
requires Apple signing/provisioning; the web app is available on iPhone/iPad.
