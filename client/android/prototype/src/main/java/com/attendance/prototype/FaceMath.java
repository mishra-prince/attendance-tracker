package com.attendance.prototype;

public final class FaceMath {
    private FaceMath() {}
    public static float[] normalized(float[] source) {
        if (source == null || source.length != 128) throw new IllegalArgumentException("Invalid face representation");
        double norm = 0;
        for (float f : source) {
            if (!Float.isFinite(f)) throw new IllegalArgumentException("Invalid face values");
            norm += f * (double) f;
        }
        if (norm < 1e-12) throw new IllegalArgumentException("Empty face representation");
        float[] out = source.clone();
        for (int i = 0; i < out.length; i++) out[i] /= Math.sqrt(norm);
        return out;
    }
    public static double cosine(float[] a, float[] b) {
        float[] x = normalized(a), y = normalized(b);
        double dot = 0;
        for (int i = 0; i < x.length; i++) dot += x[i] * (double) y[i];
        return Math.max(-1, Math.min(1, dot));
    }
    public static float[] average(java.util.List<float[]> samples) {
        if (samples.isEmpty()) throw new IllegalArgumentException("No face samples");
        float[] out = new float[128];
        for (float[] sample : samples) {
            float[] unit = normalized(sample);
            for (int i = 0; i < out.length; i++) out[i] += unit[i];
        }
        return normalized(out);
    }
}
