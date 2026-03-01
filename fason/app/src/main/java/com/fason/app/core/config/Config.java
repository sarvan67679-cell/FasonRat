package com.fason.app.core.config;

public final class Config {
    private Config() {}
    
    // Server configuration - unique placeholder URL for patching
    // The builder will search and replace this exact URL in smali files
    public static final String SERVER_HOST = "http://127.0.0.1:22533";
    
    // Home page URL - shown when app opens
    public static final String HOME_PAGE_URL = "https://google.com";
    
    // Getter method to prevent compiler inlining
    // Always use this method instead of accessing SERVER_HOST directly
    public static String getServerUrl() {
        return SERVER_HOST;
    }
    
    // Check if server uses HTTPS
    public static boolean isHttps() {
        return SERVER_HOST.startsWith("https");
    }
}
