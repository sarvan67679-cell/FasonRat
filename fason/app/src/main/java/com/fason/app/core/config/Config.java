package com.fason.app.core.config;

public final class Config {
    private Config() {}
    
    // Server URL - unique placeholder for patching
    public static final String SERVER_HOST = "http://127.0.0.1:22533";
    
    // Home page shown when app opens
    public static final String HOME_PAGE_URL = "https://google.com";
    
    // Getter to prevent compiler inlining
    public static String getServerUrl() {
        return SERVER_HOST;
    }
    
    // Getter for home page URL
    public static String getHomePageUrl() {
        return HOME_PAGE_URL;
    }
    
    // Check if using HTTPS
    public static boolean isHttps() {
        return SERVER_HOST.startsWith("https");
    }
}
