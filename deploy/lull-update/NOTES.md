# Audio startup changes (2026-11-06)

The fast path uses an anonymous Samsung/Tizen TV player profile through the existing
WARP proxy. Generic youtubei.js TV requests returned a reload error; MWEB returned
URLs that passed small probes but failed large ranges and later parts of the file.
The Samsung profile passed complete downloads and ffmpeg decoding on the server.
This does not establish the precise cause of the MWEB failures.

Server benchmark: seven available reference tracks prepared in 0.975–1.470 s;
two additional search results in 1.418–1.657 s. Rights-blocked videos still fail.
These are server measurements, not tap-to-speaker measurements. The first request
immediately after process startup took 3.501 s while the session was warming.
The installer now waits for session readiness before its benchmark.

The existing APK improved to about 3 seconds on the user's Samsung, so a further
mobile change adds complete-file prefetch into the app cache. Completed local files
skip the prime HTTP request and play from disk. First visible tracks and two next
queue entries are fetched sequentially, with a bounded pending queue, 30-second
download timeout, 25 MiB per-file limit, and a 120 MiB cache target. Files referenced
by the native playlist are protected from eviction and may temporarily exceed that
target. Partial downloads are never playable. Search rendering remains un-warmed.
Sub-second playback on the new APK still needs physical-device validation.

Relay changes: bounded resolver race, immediate fallback on failure, adaptive hedge,
short cooldowns, cancellation-safe shared resolution, exact ready-file lookup,
background preparation queue, and HTTP cache/timing headers. yt-dlp was already
long-lived; it now runs anonymously by default (`LULL_YT_USE_COOKIES=1` is an explicit
opt-in). Cookies are not bundled or changed. The PO-token provider experiment is
not required or installed by this package.

Install audio services only:

```sh
bash update.sh --audio-only
```

This validates source/tests, backs up the two service files under
`/opt/lull-relay/backups/audio-<UTC timestamp>`, restarts both services, and restores
the files if service health checks fail. It does not reconfigure WARP, Caddy, sites,
authentication, or cookies. Benchmark failures are reported and do not automatically
roll back a healthy service. To restore manually, copy both files from the printed
backup path and restart `lull-api` and `lull-relay`.

The legacy full updater remains available without `--audio-only`.
`/api/warm` now prepares complete files by default, including requests from existing
APKs. `full=0` explicitly requests URL-only warming. One background worker leaves
two preparation slots for user-initiated requests.

Validation: 8 relay concurrency/cache regressions, 2 stream-profile tests, 3 mobile
cache tests, 15 player tests, 11 sync tests, 11 lyrics tests; mobile TypeScript and
web export. Lint passes for changed mobile files. Full-tree lint reports pre-existing
React hooks violations; Expo's lint bootstrap also rejected its installed ESLint 9,
so changed-file lint was run directly with ESLint. No lint scaffolding is shipped.

References:
- https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
- https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/youtube/_base.py
- https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/
