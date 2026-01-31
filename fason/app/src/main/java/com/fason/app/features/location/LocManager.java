package com.fason.app.features.location;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;

import androidx.core.content.ContextCompat;

import org.json.JSONObject;

public class LocManager {

    private final Context ctx;
    private Location location;
    private boolean canGetLocation;

    public LocManager(Context context) {
        this.ctx = context;
        fetchLocation();
    }

    private void fetchLocation() {
        try {
            LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
            if (lm == null || !hasPermission()) return;

            boolean gps = lm.isProviderEnabled(LocationManager.GPS_PROVIDER);
            boolean net = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
            canGetLocation = gps || net;

            if (net) location = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            if (gps && location == null) location = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
        } catch (SecurityException ignored) {}
    }

    private boolean hasPermission() {
        return ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    public boolean canGetLocation() { return canGetLocation; }

    public JSONObject getData() {
        JSONObject data = new JSONObject();
        try {
            if (location != null) {
                data.put("enabled", true);
                data.put("latitude", location.getLatitude());
                data.put("longitude", location.getLongitude());
                data.put("altitude", location.getAltitude());
                data.put("accuracy", location.getAccuracy());
                data.put("speed", location.getSpeed());
            } else {
                data.put("enabled", false);
            }
        } catch (Exception ignored) {}
        return data;
    }
}
