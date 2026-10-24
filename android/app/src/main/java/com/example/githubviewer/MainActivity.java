package com.example.githubviewer;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SecureVaultPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
