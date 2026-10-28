package website.lull.app;

import android.app.Instrumentation;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONTokener;
import org.json.JSONObject;
import android.os.SystemClock;
import android.view.MotionEvent;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class LaunchTest {
    private String evaluate(Instrumentation instrumentation, MainActivity activity, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>("null");
        instrumentation.runOnMainSync(() -> activity.getBridge().getWebView().evaluateJavascript(script, result -> { value.set(result); done.countDown(); }));
        if (!done.await(5, TimeUnit.SECONDS)) return "pending";
        return String.valueOf(new JSONTokener(value.get()).nextValue());
    }
    private void verifyNativePlayback(Instrumentation instrumentation, MainActivity activity) throws Exception {
        evaluate(instrumentation, activity,
            "window.__storageCheck='pending'; (async()=>{try {const p=window.Capacitor.Plugins.AccountStorage; await p.set({key:'lull-account-qa',value:'test-session'}); const r=await p.get({key:'lull-account-qa'}); await p.set({key:'lull-account-qa',value:null}); window.__storageCheck=r.value==='test-session'?'pass':'fail';} catch(e){window.__storageCheck=String(e)}})(); 'started'");
        String storage = "pending";
        for (int i=0;i<40;i++) { storage=evaluate(instrumentation, activity,"window.__storageCheck"); if (!storage.equals("pending")) break; Thread.sleep(250); }
        assertEquals("Encrypted Android session storage", "pass", storage);
        evaluate(instrumentation, activity,
            "window.__qaAudio=[]; const oldPlay=HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play=function(){this.muted=true;if(!window.__qaAudio.includes(this))window.__qaAudio.push(this);return oldPlay.call(this)}; location.hash='#/search?q=Daft%20Punk'; 'started'");
        String found = "false";
        for (int i=0;i<120;i++) { found=evaluate(instrumentation, activity,"!!document.querySelector('.trow .tt')"); if (found.equals("true")) break; Thread.sleep(500); }
        assertEquals("Search returns playable tracks", "true", found);
        instrumentation.runOnMainSync(() -> {
            if (activity.getCurrentFocus() != null) activity.getCurrentFocus().clearFocus();
            android.view.inputmethod.InputMethodManager keyboard = (android.view.inputmethod.InputMethodManager)activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE);
            keyboard.hideSoftInputFromWindow(activity.getBridge().getWebView().getWindowToken(), 0);
        });
        SystemClock.sleep(700);
        evaluate(instrumentation, activity,"document.activeElement?.blur();document.querySelector('.trow .tt').scrollIntoView({block:'center'});'visible'");
        SystemClock.sleep(500);
        long started=System.currentTimeMillis();
        JSONObject point = new JSONObject(evaluate(instrumentation, activity,
            "JSON.stringify((()=>{const r=document.querySelector('.trow .tt').getBoundingClientRect();return {x:(r.left+r.width/2)/innerWidth,y:(r.top+r.height/2)/innerHeight}})())"));
        final float[] tap = new float[2];
        assertTrue("Track must be inside viewport: " + point, point.optDouble("x") > 0 && point.optDouble("x") < 1 && point.optDouble("y") > 0 && point.optDouble("y") < 1);
        instrumentation.runOnMainSync(() -> {
            int[] origin = new int[2]; activity.getBridge().getWebView().getLocationOnScreen(origin);
            tap[0] = origin[0] + (float)point.optDouble("x") * activity.getBridge().getWebView().getWidth();
            tap[1] = origin[1] + (float)point.optDouble("y") * activity.getBridge().getWebView().getHeight();
        });
        // A real platform gesture is required by WebView autoplay policy.
        // evaluateJavascript(...click()) is untrusted and cannot test playback.
        long down = SystemClock.uptimeMillis();
        instrumentation.sendPointerSync(MotionEvent.obtain(down, down, MotionEvent.ACTION_DOWN, tap[0], tap[1], 0));
        SystemClock.sleep(80);
        instrumentation.sendPointerSync(MotionEvent.obtain(down, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, tap[0], tap[1], 0));
        String playing="false";
        while(System.currentTimeMillis()-started<45000) {
            playing=evaluate(instrumentation, activity,"window.__qaAudio.some(a=>!a.paused&&a.currentTime>0.3)");
            if(playing.equals("true")) break;
            Thread.sleep(250);
        }
        System.out.println("LULL_ANDROID_PLAYBACK_MS="+(System.currentTimeMillis()-started));
        String details = evaluate(instrumentation, activity,"JSON.stringify({audio:window.__qaAudio.map(a=>({time:a.currentTime,paused:a.paused,ready:a.readyState,error:a.error?.code})),text:document.body.innerText.slice(-1500)})");
        assertEquals("Real WebView decoder advances playback: " + details, "true", playing);
    }
    @Test public void catalogueAndMobileNavigationLoad() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        MainActivity activity = (MainActivity) instrumentation.startActivitySync(
            instrumentation.getTargetContext().getPackageManager().getLaunchIntentForPackage("website.lull.app")
                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            long deadline = System.currentTimeMillis() + 60000;
            String state = "";
            while (System.currentTimeMillis() < deadline) {
                CountDownLatch done = new CountDownLatch(1);
                AtomicReference<String> value = new AtomicReference<>("");
                instrumentation.runOnMainSync(() -> activity.getBridge().getWebView().evaluateJavascript(
                    "JSON.stringify({native:!!window.Capacitor?.isNativePlatform?.(),tabs:document.querySelectorAll('.m-tab').length,content:document.querySelectorAll('.card[role=link],.trow').length,error:document.body.innerText.includes('Не получилось загрузить')})",
                    result -> { value.set(result); done.countDown(); }));
                // An evaluation queued during the initial document navigation
                // can be discarded; retry after the WebView finishes loading.
                if (!done.await(5, TimeUnit.SECONDS)) continue;
                state = value.get();
                if (state.contains("\\\"native\\\":true") && state.contains("\\\"tabs\\\":4") && !state.contains("\\\"content\\\":0") && state.contains("\\\"error\\\":false")) {
                    verifyNativePlayback(instrumentation, activity);
                    return;
                }
                Thread.sleep(500);
            }
            fail("Mobile catalogue did not load: " + state);
        } finally { instrumentation.runOnMainSync(activity::finish); }
    }
}
