package com.attendance.prototype;

/** Camera readiness only. This does not capture identity or satisfy any challenge action. */
public final class FacePreparation {
    private int stable;
    private Integer track;
    private long lastFrame = -1;

    public void observe(long now, Integer trackingId, String guidance) {
        if (guidance != null || trackingId == null) {
            stable = 0; track = null; lastFrame = now; return;
        }
        if (lastFrame < 0 || now <= lastFrame || now - lastFrame >= 1000 || !trackingId.equals(track)) stable = 0;
        stable++; track = trackingId; lastFrame = now;
    }
    public boolean ready(long now) {
        return stable >= 3 && lastFrame >= 0 && now >= lastFrame && now - lastFrame < 1000;
    }
}
