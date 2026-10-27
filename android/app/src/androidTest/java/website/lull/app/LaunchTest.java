package website.lull.app;

import android.app.Instrumentation;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class LaunchTest {
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
                assertTrue("WebView did not respond", done.await(5, TimeUnit.SECONDS));
                state = value.get();
                if (state.contains("\\\"native\\\":true") && state.contains("\\\"tabs\\\":4") && !state.contains("\\\"content\\\":0") && state.contains("\\\"error\\\":false")) return;
                Thread.sleep(500);
            }
            fail("Mobile catalogue did not load: " + state);
        } finally { instrumentation.runOnMainSync(activity::finish); }
    }
}
