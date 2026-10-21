package com.attendance.calibration;

import java.util.ArrayList;
import java.util.List;

/** Experimental FSK transport detector. A decoded frame is not authenticated room evidence. */
public final class SignalDecoder {
    public static final int PREAMBLE = 0xDDAA;
    public static final int FRAME_BITS = 40;
    public static final double SYMBOL_SECONDS = 0.040;
    private static final double HOP_SECONDS = 0.005;
    private static final double WINDOW_SECONDS = 0.020;

    public static final class Frame {
        public final int code;
        public final double seconds;
        public final double contrast;
        Frame(int code, double seconds, double contrast) {
            this.code = code; this.seconds = seconds; this.contrast = contrast;
        }
    }

    public static final class Result {
        public final List<Frame> frames = new ArrayList<>();
        public int matchingFrames;
        public int otherFrames;
        public double rmsDbfs;
        public double clippedFraction;
        public double meanContrast;
        public double toneFraction;
    }

    public static int crc8(int code) {
        if (code < 0 || code > 0xffff) throw new IllegalArgumentException("Code must be 16 bits");
        int crc = 0;
        for (int shift : new int[]{8, 0}) {
            crc ^= (code >> shift) & 255;
            for (int bit = 0; bit < 8; bit++) crc = ((crc & 0x80) != 0 ? (crc << 1) ^ 0x07 : crc << 1) & 255;
        }
        return crc;
    }

    public static Result decode(short[] pcm, int rate, int lowHz, int highHz, int expectedCode) {
        if (pcm == null || pcm.length == 0 || rate < 16000 || expectedCode < 0 || expectedCode > 0xffff
                || lowHz < 500 || highHz <= lowHz || highHz >= rate / 2 - 200) {
            throw new IllegalArgumentException("Invalid samples, frequency profile or code");
        }
        Result result = new Result();
        double sum = 0;
        int clipped = 0;
        for (short s : pcm) {
            double v = s / 32768.0;
            sum += v * v;
            if (Math.abs((int)s) >= 32700) clipped++;
        }
        result.rmsDbfs = 10 * Math.log10(Math.max(1e-12, sum / pcm.length));
        result.clippedFraction = clipped / (double)pcm.length;
        int hop = (int)Math.round(rate * HOP_SECONDS);
        int window = (int)Math.round(rate * WINDOW_SECONDS);
        int bins = pcm.length < window ? 0 : (pcm.length - window) / hop + 1;
        int[] bits = new int[bins];
        double[] contrast = new double[bins];
        double[] hann = new double[window];
        for (int i = 0; i < window; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (window - 1));
        double lowCoeff = 2 * Math.cos(2 * Math.PI * lowHz / rate);
        double highCoeff = 2 * Math.cos(2 * Math.PI * highHz / rate);
        int tonal = 0;
        for (int i = 0; i < bins; i++) {
            double a = power(pcm, i * hop, hann, lowCoeff);
            double b = power(pcm, i * hop, hann, highCoeff);
            contrast[i] = Math.abs(b - a) / Math.max(1e-15, a + b);
            bits[i] = a + b > 1e-9 && contrast[i] >= 0.45 ? (b > a ? 1 : 0) : -1;
            if (bits[i] >= 0) tonal++;
        }
        result.toneFraction = bins == 0 ? 0 : tonal / (double)bins;

        // Search candidate offsets for a stable 20 ms window within each 40 ms symbol.
        int symbolBins = (int)Math.round(SYMBOL_SECONDS / HOP_SECONDS);
        int frameBins = FRAME_BITS * symbolBins;
        double totalContrast = 0;
        for (int start = 0; start + (FRAME_BITS - 1) * symbolBins < bins; start++) {
            int preamble = 0;
            boolean valid = true;
            for (int bit = 0; bit < 16; bit++) {
                int value = bits[start + bit * symbolBins];
                if (value < 0) { valid = false; break; }
                preamble = (preamble << 1) | value;
            }
            if (!valid || preamble != PREAMBLE) continue;
            int code = 0, crc = 0;
            double quality = 0;
            for (int bit = 0; bit < FRAME_BITS; bit++) {
                int index = start + bit * symbolBins;
                int value = bits[index];
                if (value < 0) { valid = false; break; }
                quality += contrast[index];
                if (bit >= 16 && bit < 32) code = (code << 1) | value;
                if (bit >= 32) crc = (crc << 1) | value;
            }
            if (!valid || crc8(code) != crc) continue;
            quality /= FRAME_BITS;
            result.frames.add(new Frame(code, start * hop / (double)rate, quality));
            if (code == expectedCode) result.matchingFrames++; else result.otherFrames++;
            totalContrast += quality;
            start += frameBins - 1;
        }
        result.meanContrast = result.frames.isEmpty() ? 0 : totalContrast / result.frames.size();
        return result;
    }

    private static double power(short[] pcm, int offset, double[] hann, double coefficient) {
        double q1 = 0, q2 = 0;
        for (int i = 0; i < hann.length; i++) {
            double q0 = pcm[offset + i] / 32768.0 * hann[i] + coefficient * q1 - q2;
            q2 = q1; q1 = q0;
        }
        return Math.max(0, q1 * q1 + q2 * q2 - coefficient * q1 * q2) / (hann.length * (double)hann.length);
    }

    private SignalDecoder() {}
}
