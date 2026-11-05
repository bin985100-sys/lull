#!/usr/bin/env bash
# Автопроверка APK в эмуляторе: старт трека и страница артиста, всё важное из logcat — в аннотации сборки.
set -u
APK=$(ls mobile/android/app/build/outputs/apk/release/*.apk | head -1)
note() { # $1 заголовок, stdin — текст; режем на куски, чтобы влезло в аннотации
  local t="$1" body; body=$(cat | head -c 3500 | sed ':a;N;$!ba;s/%/%25/g;s/\r//g;s/\n/%0A/g')
  echo "::warning title=$t::${body:-пусто}"
}
adb install -r "$APK" >/dev/null && echo installed
adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d "lull://debug?play=dQw4w9WgXcQ" website.lull.app | tail -3
sleep 30
adb shell pidof website.lull.app >/dev/null && echo "alive after play" || echo "DEAD after play"
( echo "alive: $(adb shell pidof website.lull.app || echo НЕТ)"; adb logcat -d | grep -E "FATAL|AndroidRuntime|ReactNativeJS|ExoPlayer|expo-audio|AudioPlaylist|Error|Exception|SIGSEGV|libc|CRASH" | grep -v -E "chatty|GoogleApiManager|Finsky|gms" | tail -60 ) | note "после старта трека"
adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d "lull://debug?artist=UC0076UMUgEng8HORUw_MYHA" website.lull.app | tail -3
sleep 20
( echo "alive: $(adb shell pidof website.lull.app || echo НЕТ)"; adb logcat -d | grep -E "FATAL|AndroidRuntime|ReactNativeJS|Error|Exception|SIGSEGV|libc|CRASH" | grep -v -E "chatty|GoogleApiManager|Finsky|gms" | tail -60 ) | note "страница артиста"
adb logcat -d -b crash | tail -80 | note "буфер crash"
true
