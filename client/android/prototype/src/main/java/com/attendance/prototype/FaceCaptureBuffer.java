package com.attendance.prototype;

import java.util.UUID;

/** One-use, RAM-only transfer; camera images never enter a shared file or an oversized Intent. */
public final class FaceCaptureBuffer {
    private static String token, evidence;
    private static long expires;
    private FaceCaptureBuffer() {}
    public static synchronized String put(String value) {
        if (value == null || value.length() > 4_100_000) throw new IllegalArgumentException("Capture too large");
        token = UUID.randomUUID().toString(); evidence = value; expires = android.os.SystemClock.elapsedRealtime() + 30_000;
        String id = token;
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> { synchronized(FaceCaptureBuffer.class) { if (id.equals(token)) clear(); } },30_000);
        return token;
    }
    public static synchronized String take(String id) {
        if (token == null || !token.equals(id)) return null;
        String value = android.os.SystemClock.elapsedRealtime() < expires ? evidence : null;
        token = evidence = null; expires = 0; return value;
    }
    public static synchronized void clear() { token = evidence = null; expires = 0; }
}
