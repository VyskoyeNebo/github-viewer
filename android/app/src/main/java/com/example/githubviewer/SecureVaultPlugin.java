package com.example.githubviewer;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

@CapacitorPlugin(name = "SecureVault")
public class SecureVaultPlugin extends Plugin {
    private SecureVaultStorage vault;

    @Override public void load() { vault = new SecureVaultStorage(getContext()); }

    @PluginMethod public void get(PluginCall call) {
        try {
            String value = vault.read();
            JSObject result = new JSObject();
            result.put("value", value == null ? JSONObject.NULL : value);
            call.resolve(result);
        } catch (Exception ignored) { call.reject("Secure storage unavailable", "VAULT_READ_FAILED"); }
    }

    @PluginMethod public void set(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.isEmpty() || value.length() > 16384) {
            call.reject("Invalid credential", "VAULT_INVALID_VALUE");
            return;
        }
        try { vault.write(value); call.resolve(); }
        catch (Exception ignored) { call.reject("Secure storage unavailable", "VAULT_WRITE_FAILED"); }
    }

    @PluginMethod public void remove(PluginCall call) {
        try { vault.clear(); call.resolve(); }
        catch (Exception ignored) { call.reject("Secure storage unavailable", "VAULT_DELETE_FAILED"); }
    }
}
