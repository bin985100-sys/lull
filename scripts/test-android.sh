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
adb shell pidof website.lull.app || result=1
adb exec-out screencap -p > test-results/android-release.png
adb logcat -d > test-results/android-logcat.txt
adb shell uiautomator dump /sdcard/lull-window.xml
adb pull /sdcard/lull-window.xml test-results/android-window.xml
if grep -q 'FATAL EXCEPTION' test-results/android-logcat.txt; then result=1; fi
exit "$result"
