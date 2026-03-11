package com.fason.app.ui;

import android.graphics.Bitmap;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;

import com.fason.app.core.config.Config;

// Home page WebView manager
public class HomeManager {

    private WebView webView;
    private ProgressBar progress;
    private boolean loaded = false;

    // Initialize WebView and ProgressBar
    public void init(WebView wv, ProgressBar pb) {
        this.webView = wv;
        this.progress = pb;
        setupWebView();
    }

    // Setup WebView settings and client
    private void setupWebView() {
        if (webView == null) return;
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView v, String url) {
                if (progress != null) progress.setVisibility(View.GONE);
            }
            @Override
            public void onPageStarted(WebView v, String url, Bitmap fav) {
                if (progress != null) progress.setVisibility(View.VISIBLE);
            }
        });
    }

    // Load home page URL
    public void loadPage() {
        if (webView == null || loaded) return;
        if (progress != null) progress.setVisibility(View.VISIBLE);
        webView.loadUrl(Config.getHomePageUrl());
        loaded = true;
    }

    // Check can go back
    public boolean canGoBack() {
        return webView != null && webView.canGoBack();
    }

    // Go back in WebView
    public void goBack() {
        if (webView != null && webView.canGoBack()) webView.goBack();
    }

    // Save WebView state
    public void saveState(Bundle out) {
        if (webView != null) webView.saveState(out);
    }

    // Restore WebView state
    public void restoreState(Bundle state) {
        if (state != null && webView != null) {
            webView.restoreState(state);
            loaded = true;
        }
    }

    // Check if page loaded
    public boolean isLoaded() {
        return loaded;
    }

    // Set loaded state
    public void setLoaded(boolean loaded) {
        this.loaded = loaded;
    }

    // Destroy WebView
    public void destroy() {
        if (webView != null) webView.destroy();
        webView = null;
        progress = null;
    }

    // Reload page
    public void reload() {
        if (webView != null) webView.reload();
    }

    // Get current URL
    public String getUrl() {
        return webView != null ? webView.getUrl() : null;
    }
}
