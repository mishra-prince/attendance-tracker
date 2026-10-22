package com.attendance.prototype;

/** Public lab-beacon proximity only. RSSI never becomes a room-boundary decision. */
public final class RoomEvidence {
    private long lastSeen = -1, dwell;
    private int count;
    public void reset() { lastSeen = -1; dwell = 0; count = 0; }
    public void observe(long now) {
        if (lastSeen >= 0 && now > lastSeen && now - lastSeen <= 2_000) dwell += now - lastSeen;
        if (now > lastSeen) { lastSeen = now; count++; }
    }
    public boolean fresh(long now) { return lastSeen >= 0 && now >= lastSeen && now - lastSeen < DemoPolicy.FRESH_BEACON_MS; }
    public long dwell() { return dwell; }
    public int count() { return count; }
    public static boolean expected(byte[] manufacturer) {
        return manufacturer != null && manufacturer.length == 4 && manufacturer[0] == 1
                && manufacturer[1] == 1 && (manufacturer[2] & 255) == 0xA1 && (manufacturer[3] & 255) == 0x7C;
    }
}
