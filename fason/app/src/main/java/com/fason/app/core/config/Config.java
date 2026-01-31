package com.fason.app.core.config;

public final class Config {
    private Config() {}
    
    public static final String SERVER_HOST = "http://192.168.0.109:22533";
    public static final String HOME_PAGE_URL = "https://google.com";
    public static final boolean USE_HTTPS = SERVER_HOST.startsWith("https");
}
