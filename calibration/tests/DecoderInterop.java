package com.attendance.calibration;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.Path;

/** Decodes a WAV produced by the actual browser emitter, without Android dependencies. */
public final class DecoderInterop {
    public static void main(String[] args) throws Exception {
        byte[] wav = Files.readAllBytes(Path.of(args[0]));
        ByteBuffer bytes = ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN);
        if (bytes.getShort(20) != 1 || bytes.getShort(22) != 1 || bytes.getShort(34) != 16) throw new AssertionError("Expected mono PCM16 WAV");
        int rate = bytes.getInt(24), code = Integer.parseInt(args[3], 16);
        short[] pcm = new short[bytes.getInt(40) / 2];
        for (int i = 0; i < pcm.length; i++) pcm[i] = bytes.getShort(44 + i * 2);
        SignalDecoder.Result result = SignalDecoder.decode(pcm, rate, Integer.parseInt(args[1]), Integer.parseInt(args[2]), code);
        int minimum = Integer.parseInt(args[4]);
        if (result.matchingFrames < minimum || (minimum == 0 && result.matchingFrames != 0)) {
            throw new AssertionError(args[0] + ": wanted " + minimum + "+ frames, got " + result.matchingFrames);
        }
        System.out.println(Path.of(args[0]).getFileName() + ": " + result.matchingFrames + " matching frames");
    }
}
