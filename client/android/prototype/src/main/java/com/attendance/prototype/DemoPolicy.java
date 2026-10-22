package com.attendance.prototype;

/** Experimental demonstration settings. These are not institutional attendance policy. */
public final class DemoPolicy {
    private DemoPolicy() {}
    public static final long CLASS_MS = 60_000;
    public static final long MIN_DWELL_MS = 45_000;
    public static final long FRESH_BEACON_MS = 5_000;
    public static final long CHALLENGE_MS = 30_000;
    public static final double MATCH_COSINE = 0.50;
    public static final int SAMPLES = 3;
}
