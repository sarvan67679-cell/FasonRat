package com.fason.app.core;

import android.app.Application;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.fason.app.service.MainService;
import com.fason.app.worker.KeepAliveWorker;

import java.util.concurrent.TimeUnit;

// Main application class
public class FasonApp extends Application {

    private static FasonApp instance;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        startServices();
    }

    // Start all background services
    private void startServices() {
        // Start foreground service
        Intent intent = new Intent(this, MainService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }

        // Schedule keep-alive worker
        try {
            PeriodicWorkRequest work = new PeriodicWorkRequest.Builder(
                KeepAliveWorker.class, 15, TimeUnit.MINUTES
            ).build();

            WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                "KeepAliveWork",
                ExistingPeriodicWorkPolicy.KEEP,
                work
            );
        } catch (Exception ignored) {}
    }

    // Get application context
    public static Context getContext() {
        if (instance == null) {
            throw new IllegalStateException("FasonApp not initialized");
        }
        return instance.getApplicationContext();
    }
}
