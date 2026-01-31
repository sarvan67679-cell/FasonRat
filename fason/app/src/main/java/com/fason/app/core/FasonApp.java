package com.fason.app.core;

import android.app.Application;
import android.content.Context;

/**
 * Central application entry-point that exposes a process-wide application context.
 */
public class FasonApp extends Application {

    private static FasonApp instance;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
    }

    public static Context getContext() {
        if (instance == null) {
            throw new IllegalStateException("FasonApp has not been initialized");
        }
        return instance.getApplicationContext();
    }
}
