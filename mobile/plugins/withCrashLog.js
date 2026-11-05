/* Записываем нативный (Java/Kotlin) вылет приложения в хранилище AsyncStorage,
   чтобы при следующем запуске показать его и отправить на сервер Lull. */
const { withMainApplication } = require('@expo/config-plugins');

const CODE = `
    // Lull: записываем нативный вылет, чтобы показать его при следующем запуске
    val lullPrev = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { t, e ->
      try {
        val sw = java.io.StringWriter()
        e.printStackTrace(java.io.PrintWriter(sw))
        var tail = ""
        try {
          val pr = Runtime.getRuntime().exec(arrayOf("logcat", "-d", "-t", "150", "--pid=" + android.os.Process.myPid()))
          tail = pr.inputStream.bufferedReader().readText().takeLast(9000)
        } catch (_: Throwable) {}
        val text = java.util.Date().toString() + "\\nnative " + t.name + ": " + sw.toString().take(6000) + "\\n--- logcat ---\\n" + tail
        val path = getDatabasePath("RKStorage")
        path.parentFile?.mkdirs()
        val db = android.database.sqlite.SQLiteDatabase.openOrCreateDatabase(path, null)
        db.execSQL("CREATE TABLE IF NOT EXISTS catalystLocalStorage (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        db.execSQL("INSERT OR REPLACE INTO catalystLocalStorage (key, value) VALUES (?, ?)", arrayOf<Any>("lull.nativeCrash", text))
        db.close()
      } catch (_: Throwable) {}
      lullPrev?.uncaughtException(t, e)
    }
    // Lull: известный сбой медиасессии Media3 — «Invalid PlayerInfo update» при быстром переключении треков.
    // Это рассинхрон уведомления с плеером, звук он не трогает: пропускаем такое обновление, а не роняем приложение.
    android.os.Handler(android.os.Looper.getMainLooper()).post {
      while (true) {
        try {
          android.os.Looper.loop()
        } catch (e: Throwable) {
          val m = e.message ?: ""
          if (e is IllegalStateException && m.contains("Invalid PlayerInfo update")) {
            android.util.Log.w("Lull", "пропускаю сбой медиасессии: " + m)
            continue
          }
          throw e
        }
      }
    }
`;

module.exports = function withCrashLog(config) {
  return withMainApplication(config, (c) => {
    let src = c.modResults.contents;
    if (!src.includes('lull.nativeCrash')) {
      src = src.replace(/super\.onCreate\(\)\s*\n/, (m) => m + CODE);
      if (!src.includes('lull.nativeCrash')) throw new Error('withCrashLog: не нашёл super.onCreate() в MainApplication');
    }
    c.modResults.contents = src;
    return c;
  });
};
