#!/usr/bin/env bash
# Автопроверка APK в эмуляторе: старт трека по ссылке, страница артиста, нажатия как у человека.
# Лог только процесса Lull — в аннотации сборки.
set -u
PKG=website.lull.app
APK=$(ls mobile/android/app/build/outputs/apk/release/*.apk | head -1)
note() { local t="$1" body; body=$(cat | head -c 3800 | sed ':a;N;$!ba;s/%/%25/g;s/\r//g;s/\n/%0A/g'); echo "::warning title=$t::${body:-пусто}"; }
applog() { local pid; pid=$(adb shell pidof $PKG | tr -d '\r'); echo "alive: ${pid:-НЕТ — приложение упало}";
  adb logcat -d -v brief -b crash | tail -40
  [ -n "$pid" ] && adb logcat -d -v brief --pid="$pid" | grep -v -E "^[VD]/|Choreographer|OpenGLRenderer|EGL_emulation|HWUI" | tail -40; }
tapdesc() { # нажать на элемент по началу описания (accessibilityLabel)
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1
  python3 - "$1" <<'P'
import re,sys,subprocess
x=open('/tmp/ui.xml',encoding='utf8').read()
for m in re.finditer(r'<node [^>]*?content-desc="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',x):
    d,a,b,c,e=m.group(1),*map(int,m.groups()[1:])
    if d.startswith(sys.argv[1]):
        subprocess.run(['adb','shell','input','tap',str((a+c)//2),str((b+e)//2)]); print('tap',d); break
else: print('не нашёл',sys.argv[1]); print('\n'.join(sorted(set(re.findall(r'content-desc="([^"]+)"',x)))[:40]))
P
}
adb install -r "$APK" >/dev/null && echo installed

adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d "lull://debug?play=kJQP7kiw5Fk" $PKG >/dev/null
sleep 35
applog | note "1. старт трека по ссылке (холодный)"

adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d "lull://debug?artist=UC0076UMUgEng8HORUw_MYHA" $PKG >/dev/null
sleep 15
tapdesc "Слушать" | note "2a. кнопка Слушать на странице артиста"
sleep 30
applog | note "2b. после Слушать"

adb logcat -c
adb shell input swipe 540 1600 540 900 300; sleep 2
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1
ROW=$(python3 -c "import re;x=open('/tmp/ui.xml',encoding='utf8').read();r=[d for d in re.findall(r'content-desc=\"([^\"]+, [^\"]+)\"',x)];print(r[1] if len(r)>1 else (r[0] if r else ''))")
tapdesc "$ROW" | note "3a. нажатие на строку трека: $ROW"
sleep 30
applog | note "3b. после нажатия на трек"
adb shell screencap -p /sdcard/s.png; adb pull /sdcard/s.png diag-screen.png >/dev/null
adb logcat -d -b crash | tail -60 | note "буфер crash"
true
