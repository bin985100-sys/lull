package website.lull.app;

import android.app.Instrumentation;
import android.os.SystemClock;
import android.view.MotionEvent;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class LaunchTest {
    private ActivityScenario<MainActivity> scenario;

    private int activityIdentity() {
        AtomicReference<MainActivity> active = new AtomicReference<>();
        scenario.onActivity(active::set);
        return System.identityHashCode(active.get());
    }

    private String evaluate(String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>("null");
        // ActivityScenario supplies the current Activity after a system
        // recreation; a saved raw Activity points at a destroyed WebView.
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script,
            result -> { value.set(result); done.countDown(); }));
        if (!done.await(5, TimeUnit.SECONDS)) return "pending";
        return String.valueOf(new JSONTokener(value.get()).nextValue());
    }

    private boolean verifyStorage() throws Exception {
        int activity=activityIdentity();
        try (InputStream input=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("account-storage-probe.js")) {
            ByteArrayOutputStream output=new ByteArrayOutputStream();byte[] bytes=new byte[8192];int count;
            while((count=input.read(bytes))!=-1) output.write(bytes,0,count);
            evaluate(new String(output.toByteArray(),StandardCharsets.UTF_8)+"; 'probe-ready'");
        }
        evaluate("window.__storageCheck='pending'; (async()=>{try{const p=window.Capacitor.Plugins.AccountStorage;const r=await LullAccountStorageProbe.runAccountStorageProbe({getItem:async key=>(await p.get({key})).value,setItem:(key,value)=>p.set({key,value}),removeItem:key=>p.set({key,value:null})});window.__storageCheck=r.pkceSlots===2?'pass':'fail';console.log('LULL_ANDROID_ACCOUNT_STORAGE='+JSON.stringify(r))}catch(e){window.__storageCheck=String(e)}})();'started'");
        String storage="pending";
        for(int i=0;i<40;i++) {
            if(activityIdentity()!=activity) return false;
            storage=evaluate("window.__storageCheck");
            if(activityIdentity()!=activity) return false;
            if(!storage.equals("pending")) break;
            SystemClock.sleep(250);
        }
        assertEquals("Encrypted Android session storage", "pass", storage);
        return true;
    }

    private boolean attemptPlayback(Instrumentation instrumentation) throws Exception {
        int activity = activityIdentity();
        evaluate("(()=>{if(!window.__qaAudio){window.__qaAudio=[];const old=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){this.muted=true;if(!window.__qaAudio.includes(this))window.__qaAudio.push(this);return old.call(this)}}location.hash='#/search?q=Daft%20Punk'})();'started'");
        String found="false";
        for(int i=0;i<120;i++) {
            if(activityIdentity()!=activity) return false;
            found=evaluate("!!document.querySelector('[aria-label=\"Тип результатов\"]') && !!document.querySelector('.trow .tt')");
            if(found.equals("true")) break;
            SystemClock.sleep(500);
        }
        assertEquals("Search returns playable tracks", "true", found);
        scenario.onActivity(current -> {
            if(current.getCurrentFocus()!=null) current.getCurrentFocus().clearFocus();
            android.view.inputmethod.InputMethodManager keyboard=(android.view.inputmethod.InputMethodManager)current.getSystemService(android.content.Context.INPUT_METHOD_SERVICE);
            keyboard.hideSoftInputFromWindow(current.getBridge().getWebView().getWindowToken(),0);
        });
        SystemClock.sleep(700);
        if(activityIdentity()!=activity) return false;
        evaluate("document.activeElement?.blur();document.querySelector('.trow .tt').scrollIntoView({block:'center'});'visible'");
        SystemClock.sleep(500);
        if(activityIdentity()!=activity) return false;
        String coordinates="null";
        for(int i=0;i<20;i++) {
            if(activityIdentity()!=activity) return false;
            coordinates=evaluate("JSON.stringify((()=>{const el=document.querySelector('.trow .tt');if(!el)return null;el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return{x:(r.left+r.width/2)/innerWidth,y:(r.top+r.height/2)/innerHeight}})())");
            if(coordinates.startsWith("{")) break;
            SystemClock.sleep(500);
        }
        assertTrue("Search track remains mounted before native tap: "+coordinates,coordinates.startsWith("{"));
        JSONObject point=new JSONObject(coordinates);
        assertTrue("Track must be in viewport: "+point,point.optDouble("x")>0&&point.optDouble("x")<1&&point.optDouble("y")>0&&point.optDouble("y")<1);
        float[] tap=new float[2];
        scenario.onActivity(current -> {
            int[] origin=new int[2];current.getBridge().getWebView().getLocationOnScreen(origin);
            tap[0]=origin[0]+(float)point.optDouble("x")*current.getBridge().getWebView().getWidth();
            tap[1]=origin[1]+(float)point.optDouble("y")*current.getBridge().getWebView().getHeight();
        });
        long started=SystemClock.uptimeMillis();
        MotionEvent down=MotionEvent.obtain(started,started,MotionEvent.ACTION_DOWN,tap[0],tap[1],0);
        MotionEvent up=MotionEvent.obtain(started,started+80,MotionEvent.ACTION_UP,tap[0],tap[1],0);
        try {
            instrumentation.sendPointerSync(down);SystemClock.sleep(80);instrumentation.sendPointerSync(up);
        } catch(IllegalArgumentException error) {
            if(activityIdentity()!=activity) return false;
            throw error;
        } finally {down.recycle();up.recycle();}
        String playing="false";
        while(SystemClock.uptimeMillis()-started<45000) {
            if(activityIdentity()!=activity) return false;
            playing=evaluate("!!window.__qaAudio?.some(a=>!a.paused&&a.currentTime>0.3)");
            if(playing.equals("true")) break;
            SystemClock.sleep(250);
        }
        String details=evaluate("JSON.stringify({audio:window.__qaAudio?.map(a=>({time:a.currentTime,paused:a.paused,ready:a.readyState,error:a.error?.code})),text:document.body.innerText.slice(-1500)})");
        assertEquals("Real WebView decoder advances playback: "+details,"true",playing);
        System.out.println("LULL_ANDROID_PLAYBACK_MS="+(SystemClock.uptimeMillis()-started));
        return true;
    }

    @Test public void catalogueAndMobileNavigationLoad() throws Exception {
        Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
        try(ActivityScenario<MainActivity> launched=ActivityScenario.launch(MainActivity.class)) {
            scenario=launched;
            long deadline=SystemClock.uptimeMillis()+60000;
            boolean ready=false;
            while(SystemClock.uptimeMillis()<deadline) {
                String raw=evaluate("JSON.stringify({native:!!window.Capacitor?.isNativePlatform?.(),tabs:document.querySelectorAll('.m-tab').length,content:document.querySelectorAll('.card[role=link],.trow').length,error:document.body.innerText.includes('Не получилось загрузить')})");
                if(!raw.equals("pending")&&!raw.equals("null")) {
                    JSONObject state=new JSONObject(raw);
                    if(state.optBoolean("native")&&state.optInt("tabs")==4&&state.optInt("content")>0&&!state.optBoolean("error")) {ready=true;break;}
                }
                SystemClock.sleep(500);
            }
            assertTrue("Mobile catalogue loads",ready);
            boolean storageVerified=false;
            for(int attempt=0;attempt<2;attempt++) {
                if(verifyStorage()) {storageVerified=true;break;}
                System.out.println("LULL_ANDROID_ACTIVITY_RECREATED: restarting storage probe after confirmed recreation");
                long storageDeadline=SystemClock.uptimeMillis()+15000;
                while(SystemClock.uptimeMillis()<storageDeadline&&!evaluate("!!window.Capacitor?.isNativePlatform?.() && document.querySelectorAll('.m-tab').length===4").equals("true")) SystemClock.sleep(250);
            }
            assertTrue("Storage verification must finish without repeated Activity recreation",storageVerified);
            // Retry only a confirmed system Activity recreation, never a
            // decoder/network assertion. Keep this event visible in reports.
            for(int attempt=0;attempt<2;attempt++) {
                if(attemptPlayback(instrumentation)) return;
                System.out.println("LULL_ANDROID_ACTIVITY_RECREATED: restarting foreground UI verification");
            }
            fail("Activity was recreated twice during foreground playback verification");
        }
    }
}
