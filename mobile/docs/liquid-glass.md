# Lull Liquid Glass

The main motion reference is the supplied Apple Music recording (video 2). Seven supplied clips were decoded (8,582 frames) and scanned for motion/scene changes. Contact sheets and 15 fps transition sequences informed the implementation. Personal reference frames are kept outside the repository and are not application assets.

## Interaction contract

- Floating 3-tab group with Lull SVGs; a neutral lens previews cyan icons/labels under the finger. Dragging stretches and lifts the lens. Routing commits once on release; cancellation restores the selection. New presses are accepted immediately after a completed drag.
- Separate mini-player and search circle. Downward scrolling collapses navigation into its active circle and moves the mini-player between the circles; upward scrolling restores it. A compact-navigation button also restores the group.
- Search becomes a bottom field with a back circle on small screens; wide layouts keep the field in the page. The query survives these layout changes. Native keyboard events and the web visual viewport provide avoidance without applying a second inset to an already resized Android window.
- Mini-player opens the full player, with a dimmed/scaled page behind it. Seeking, queue, lyrics, sleep timer, shuffle, repeat, downloads and background audio retain the existing player implementation. Long press opens a bounded, scrollable context menu; outside press, Escape and Android Back dismiss overlays.
- Light is the new default. Dark and system modes are persisted. Palettes are explicit render dependencies, including cached style tables; theme changes do not remount audio or navigation. Cover art is never inverted.
- Shared glass material is used for navigation, mini-player, menus, settings groups, round controls and secondary buttons. Filter controls have a moving selection surface. Full-player color wash comes from a static blurred cover rather than a continuously blurred full-screen scene.

## Platform and performance boundaries

- iOS 26+: native GlassView is enabled only when both Expo availability checks pass.
- Android 12+: navigation/menus use one shared BlurTargetView capture target with SDK31+ GPU blur. Android versions below 12 use a legible material fallback.
- Web: CSS backdrop filtering via Expo BlurView, with translucent material remaining visible when filtering is unavailable.
- Ordinary controls avoid live blur. Lens motion uses Reanimated shared values; JS receives gesture begin/commit and scroll threshold changes, not every animation frame. No animated SVG displacement shader or full-screen live refraction pass is introduced.
- Reduced motion and reduced transparency have separate handling. Native Apple refraction is not identical to the Android/web approximation. Browser viewport checks do not establish frame rate or keyboard behavior on a physical Samsung/iPhone; those need device verification.

## Validation

Run TypeScript and lint, the sync/player/lyrics/audio-cache suites, production web export, and browser interaction/layout checks. Review narrow phones, tablets, desktop, short landscape windows, resize while playing, long titles, theme persistence, gesture cancel, quick re-selection, menu dismissal, search, seek and sleep timer. Native APK is built by the mobile workflow only after its checks pass.
