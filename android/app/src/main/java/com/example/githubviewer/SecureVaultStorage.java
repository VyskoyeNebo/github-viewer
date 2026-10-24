package com.example.githubviewer;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Only a versioned AES-GCM ciphertext and public IV reach disk. Keys never leave AndroidKeyStore. */
final class SecureVaultStorage {
    static final String PREFS = "github_viewer_encrypted_vault";
    private static final String ENTRY = "credential_v1";
    private static final String ALIAS = "com.example.githubviewer.credential.aes.v1";
    private static final byte[] AAD = "com.example.githubviewer:credential:v1".getBytes(StandardCharsets.UTF_8);
    private final SharedPreferences preferences;

    SecureVaultStorage(Context context) {
        preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SecretKey key(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        if (!create) throw new GeneralSecurityException("Vault key unavailable");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    synchronized String read() throws Exception {
        String value = preferences.getString(ENTRY, null);
        if (value == null) return null;
        String[] parts = value.split(":", -1);
        if (parts.length != 3 || !"v1".equals(parts[0])) throw new GeneralSecurityException("Invalid vault format");
        byte[] iv = Base64.decode(parts[1], Base64.NO_WRAP);
        if (iv.length != 12) throw new GeneralSecurityException("Invalid IV");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, iv));
        cipher.updateAAD(AAD);
        return new String(cipher.doFinal(Base64.decode(parts[2], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }

    synchronized void write(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key(true));
        cipher.updateAAD(AAD);
        byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        String encoded = "v1:" + Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(ciphertext, Base64.NO_WRAP);
        if (!preferences.edit().putString(ENTRY, encoded).commit()) throw new GeneralSecurityException("Vault write failed");
    }

    synchronized void clear() throws Exception {
        if (!preferences.edit().remove(ENTRY).commit()) throw new GeneralSecurityException("Vault deletion failed");
    }
}
