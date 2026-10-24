package com.example.githubviewer;

import static org.junit.Assert.*;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.webkit.WebView;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class DeviceLoginScreenTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();

    private String text(Activity activity) throws Exception {
        AtomicReference<String> value = new AtomicReference<>("");
        CountDownLatch ready = new CountDownLatch(1);
        instrumentation.runOnMainSync(() -> {
            WebView web = activity.findViewById(com.getcapacitor.android.R.id.webview);
            web.evaluateJavascript("document.body.innerText", result -> { value.set(result); ready.countDown(); });
        });
        assertTrue("WebView should respond", ready.await(5, TimeUnit.SECONDS));
        return value.get();
    }

    @Test public void showsDeviceLoginAndAutomaticallyChecksConfiguration() throws Exception {
        new SecureVaultStorage(instrumentation.getTargetContext()).clear();
        Activity activity = instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(), MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
        try {
            long deadline = System.currentTimeMillis() + 15000;
            String content = "";
            while (System.currentTimeMillis() < deadline) {
                content = text(activity);
                if (content.contains("获取登录用户码") || content.contains("你的登录用户码")) break;
                Thread.sleep(150);
            }
            assertTrue(content.contains("GITHUB DEVICE FLOW"));
            assertTrue(content.contains("获取登录用户码") || content.contains("你的登录用户码"));
            // In a configured build a live code may be present. Placeholder builds explain setup automatically.
            assertTrue(content.contains("Client ID") || content.contains("你的登录用户码"));
        } finally { instrumentation.runOnMainSync(activity::finish); }
    }
}
