#!/usr/bin/env bash
set -uo pipefail
result=0
adb shell input keyevent 82 || true
adb shell wm dismiss-keyguard || true
(cd android && ./gradlew :app:connectedDebugAndroidTest --no-daemon) || result=$?
# Test the signed release too, even when a catalogue assertion fails.
adb uninstall website.lull.app || true
adb install android/app/build/outputs/apk/release/app-release.apk || exit 1
adb logcat -c
adb shell am start -W -n website.lull.app/.MainActivity || exit 1
sleep 20
mkdir -p test-results
# The emulator can update Play Services immediately after installation and kill
# every client of its font provider. Retry only that documented system event.
if ! adb shell pidof website.lull.app >/dev/null; then
  adb logcat -d > test-results/android-first-launch-logcat.txt
  if grep -qE 'Killing .*website\.lull\.app.*depends on provider com\.google\.android\.gms/\.fonts\.provider\.FontsProvider in dying proc' test-results/android-first-launch-logcat.txt && ! grep -q 'FATAL EXCEPTION' test-results/android-first-launch-logcat.txt; then
    echo 'LULL_ANDROID_SYSTEM_PROVIDER_RESTART: retrying signed release once'
    sleep 5
    adb logcat -c
    adb shell am start -W -n website.lull.app/.MainActivity || result=1
    sleep 20
  fi
fi
adb shell pidof website.lull.app || result=1
adb exec-out screencap -p > test-results/android-release.png
adb logcat -d > test-results/android-logcat.txt
adb shell uiautomator dump /sdcard/lull-window.xml
adb pull /sdcard/lull-window.xml test-results/android-window.xml
if grep -q 'FATAL EXCEPTION' test-results/android-logcat.txt; then result=1; fi
exit "$result"
