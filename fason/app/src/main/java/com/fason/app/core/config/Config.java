package com.fason.app.core.config;

// App configuration - patched during build
public final class Config {

    private Config() {}

    // Server URL placeholder
    public static final String SERVER_HOST = "http://127.0.0.1:22533";

    // Home page URL
    public static final String HOME_PAGE_URL = "https://google.com";

    // Get server URL
    public static String getServerUrl() {
        return SERVER_HOST;
    }

    // Get home page URL
    public static String getHomePageUrl() {
        return HOME_PAGE_URL;
    }

    // Check HTTPS
    public static boolean isHttps() {
        return SERVER_HOST.startsWith("https");
    }
}
