package com.fason.app.features.wifi;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Comparator;
import java.util.List;

public class WifiScanner {

    public static JSONObject scan(Context ctx) {
        JSONObject result = new JSONObject();
        JSONArray networks = new JSONArray();

        try {
            WifiManager wm = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
            LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);

            if (wm == null || !wm.isWifiEnabled()) {
                result.put("error", "WiFi disabled");
                return result;
            }

            boolean locEnabled = lm != null && (lm.isProviderEnabled(LocationManager.GPS_PROVIDER) 
                || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER));
            boolean hasPerm = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) 
                == PackageManager.PERMISSION_GRANTED;

            if (!locEnabled || !hasPerm) {
                result.put("error", "Location required");
                return result;
            }

            wm.startScan();
            List<ScanResult> scans = wm.getScanResults();

            if (scans != null && !scans.isEmpty()) {
                scans.sort(Comparator.comparingInt((ScanResult s) -> s.level).reversed());
                int limit = Math.min(scans.size(), 25);

                for (int i = 0; i < limit; i++) {
                    ScanResult sr = scans.get(i);
                    JSONObject net = new JSONObject();
                    net.put("BSSID", sr.BSSID);
                    net.put("SSID", sr.SSID);
                    net.put("level", sr.level);
                    net.put("frequency", sr.frequency);
                    networks.put(net);
                }
            }

            result.put("networks", networks);
        } catch (Exception e) {
            try { result.put("error", e.getMessage()); } catch (Exception ignored) {}
        }

        return result;
    }
}
