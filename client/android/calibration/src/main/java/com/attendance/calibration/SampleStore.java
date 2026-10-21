package com.attendance.calibration;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.IOException;

final class SampleStore {
    static final int LIMIT = 250;
    private static final Object LOCK = new Object();
    private final SharedPreferences preferences;

    SampleStore(Context context) { preferences = context.getApplicationContext().getSharedPreferences("lab_samples", Context.MODE_PRIVATE); }

    JSONArray read() throws JSONException {
        synchronized (LOCK) { return new JSONArray(preferences.getString("samples", "[]")); }
    }

    void append(JSONObject sample) throws JSONException, IOException {
        synchronized (LOCK) {
            JSONArray samples = read();
            if (samples.length() >= LIMIT) throw new IOException("Sample storage is full. Export and clear it before another measurement.");
            samples.put(sample);
            if (!preferences.edit().putString("samples", samples.toString()).commit()) throw new IOException("Could not save this sample on the phone.");
        }
    }

    void clear() throws IOException {
        synchronized (LOCK) {
            if (!preferences.edit().remove("samples").commit()) throw new IOException("Could not clear saved samples.");
        }
    }
}
