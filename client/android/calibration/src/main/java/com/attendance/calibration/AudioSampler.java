package com.attendance.calibration;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.SystemClock;
import java.util.Arrays;
import java.util.concurrent.CancellationException;

/** Six-second, user-started capture. The only retained output is a numeric summary. */
public final class AudioSampler {
    public static final int SECONDS = 6;
    private final Object lock = new Object();
    private volatile boolean cancelled;
    private AudioRecord active;

    public static final class Capture {
        public SignalDecoder.Result signal;
        public int sampleRate;
        public String source;
        public int inputType;
        public long elapsedMs;
    }

    public Capture capture(Context context, int lowHz, int highHz, int expectedCode) {
        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            throw new SecurityException("Microphone permission is unavailable.");
        }
        AudioManager manager = (AudioManager)context.getSystemService(Context.AUDIO_SERVICE);
        if (manager == null) throw new IllegalStateException("Audio recording is unavailable.");
        boolean raw = "true".equals(manager.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED));
        int source = raw ? MediaRecorder.AudioSource.UNPROCESSED : MediaRecorder.AudioSource.VOICE_RECOGNITION;
        AudioRecord recorder = null;
        int rate = 0;
        for (int candidate : new int[]{48000, 44100}) {
            int minimum = AudioRecord.getMinBufferSize(candidate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            if (minimum <= 0) continue;
            AudioRecord test;
            try {
                test = new AudioRecord(source, candidate, AudioFormat.CHANNEL_IN_MONO,
                        AudioFormat.ENCODING_PCM_16BIT, Math.max(minimum * 2, candidate / 2));
            } catch (IllegalArgumentException unsupportedRate) { continue; }
            if (test.getState() == AudioRecord.STATE_INITIALIZED) { recorder = test; rate = candidate; break; }
            test.release();
        }
        if (recorder == null) throw new IllegalStateException("This microphone could not open at 48 or 44.1 kHz.");
        short[] pcm = new short[rate * SECONDS];
        try {
            for (AudioDeviceInfo device : manager.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
                if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_MIC) { recorder.setPreferredDevice(device); break; }
            }
            synchronized (lock) {
                if (cancelled) throw new CancellationException("Measurement interrupted.");
                active = recorder;
                recorder.startRecording();
            }
            if (recorder.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
                throw new IllegalStateException("The microphone is busy or unavailable.");
            }
            long started = SystemClock.elapsedRealtime();
            int used = 0;
            while (used < pcm.length) {
                if (cancelled) throw new CancellationException("Measurement interrupted.");
                if (SystemClock.elapsedRealtime() - started > 8500) throw new IllegalStateException("Microphone capture timed out.");
                int read = recorder.read(pcm, used, Math.min(4096, pcm.length - used), AudioRecord.READ_BLOCKING);
                if (cancelled) throw new CancellationException("Measurement interrupted.");
                if (read < 0) throw new IllegalStateException("Microphone read failed (" + read + ").");
                if (read == 0) { SystemClock.sleep(5); continue; }
                used += read;
            }
            Capture result = new Capture();
            result.elapsedMs = SystemClock.elapsedRealtime() - started;
            AudioDeviceInfo routed = recorder.getRoutedDevice();
            result.inputType = routed == null ? AudioDeviceInfo.TYPE_UNKNOWN : routed.getType();
            result.sampleRate = rate;
            result.source = raw ? "UNPROCESSED" : "VOICE_RECOGNITION";
            recorder.stop();
            result.signal = SignalDecoder.decode(pcm, rate, lowHz, highHz, expectedCode);
            if (cancelled) throw new CancellationException("Measurement interrupted.");
            return result;
        } finally {
            synchronized (lock) {
                if (active == recorder) active = null;
                try { recorder.stop(); } catch (IllegalStateException ignored) { }
                recorder.release();
            }
            Arrays.fill(pcm, (short)0);
        }
    }

    public void cancel() {
        synchronized (lock) {
            cancelled = true;
            if (active != null) {
                try { active.stop(); } catch (IllegalStateException ignored) { }
            }
        }
    }
}
