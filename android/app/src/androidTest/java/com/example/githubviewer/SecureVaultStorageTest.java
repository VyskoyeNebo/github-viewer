package com.example.githubviewer;

import static org.junit.Assert.*;
import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class SecureVaultStorageTest {
    @Test public void encryptsAcrossInstancesAndClears() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SecureVaultStorage vault = new SecureVaultStorage(context);
        String fixture = "instrumentation-only-dummy-credential";
        try {
            vault.clear();
            assertNull(vault.read());
            vault.write(fixture);
            String first = context.getSharedPreferences(SecureVaultStorage.PREFS, 0).getString("credential_v1", "");
            assertFalse(first.contains(fixture));
            assertTrue(first.startsWith("v1:"));
            assertEquals(fixture, new SecureVaultStorage(context).read());
            vault.write(fixture);
            String second = context.getSharedPreferences(SecureVaultStorage.PREFS, 0).getString("credential_v1", "");
            assertNotEquals(first, second);
            String[] parts = second.split(":");
            char replacement = parts[2].charAt(0) == 'A' ? 'B' : 'A';
            parts[2] = replacement + parts[2].substring(1);
            context.getSharedPreferences(SecureVaultStorage.PREFS, 0).edit().putString("credential_v1", String.join(":", parts)).commit();
            try { vault.read(); fail("Tampering must be rejected"); } catch (javax.crypto.AEADBadTagException expected) { }
        } finally { vault.clear(); }
        assertNull(vault.read());
    }
}
