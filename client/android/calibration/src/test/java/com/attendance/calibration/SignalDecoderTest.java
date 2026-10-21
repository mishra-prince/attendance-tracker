package com.attendance.calibration;

import org.junit.Test;
import java.util.Random;
import static org.junit.Assert.*;

public class SignalDecoderTest {
    // Reference frame: DDAA A17C 7E, MSB first (CRC-8/SMBUS).
    private static final String FRAME = "1101110110101010101000010111110001111110";

    private short[] synth(int rate, int low, int high, String bits, double offset, double noise) {
        short[] out = new short[(int)(rate * (offset + bits.length() * .04 + .1))];
        Random random = new Random(104);
        for (int i = 0; i < out.length; i++) {
            double t = i / (double)rate - offset, value = noise * random.nextGaussian();
            int bit = (int)Math.floor(t / .04);
            if (t >= 0 && bit < bits.length()) {
                double within = t - bit * .04;
                double edge = Math.max(0, Math.min(1, Math.min(within, .04 - within) / .002));
                value += .08 * edge * Math.sin(2 * Math.PI * (bits.charAt(bit) == '1' ? high : low) * t + .72);
            }
            out[i] = (short)Math.round(Math.max(-1, Math.min(1, value)) * 32767);
        }
        return out;
    }

    @Test public void knownCrcVector() {
        assertEquals(0, SignalDecoder.crc8(0));
        assertEquals(0x7e, SignalDecoder.crc8(0xA17C));
        assertEquals(0x24, SignalDecoder.crc8(0xffff));
    }

    @Test public void allProfilesAtBothRatesDecodeWithOffsetAndNoise() {
        for (int rate : new int[]{44100, 48000}) for (int[] hz : new int[][]{{3000,4000},{17000,18000},{19000,20000}}) {
            SignalDecoder.Result result = SignalDecoder.decode(synth(rate, hz[0], hz[1], FRAME, .137, .004), rate, hz[0], hz[1], 0xA17C);
            assertEquals("rate=" + rate + " hz=" + hz[0], 1, result.matchingFrames);
            assertEquals(0, result.otherFrames);
            assertTrue(result.meanContrast > .9);
        }
    }

    @Test public void wrongExpectedCodeIsRecordedSeparately() {
        SignalDecoder.Result result = SignalDecoder.decode(synth(48000, 3000, 4000, FRAME, .08, 0), 48000, 3000, 4000, 0x1234);
        assertEquals(0, result.matchingFrames);
        assertEquals(1, result.otherFrames);
        assertEquals(0xA17C, result.frames.get(0).code);
    }

    @Test public void changedPayloadWithoutCrcUpdateIsRejected() {
        String corrupt = FRAME.substring(0, 20) + (FRAME.charAt(20) == '1' ? "0" : "1") + FRAME.substring(21);
        assertTrue(SignalDecoder.decode(synth(48000, 3000, 4000, corrupt, .1, 0), 48000, 3000, 4000, 0xA17C).frames.isEmpty());
    }

    @Test public void changedPreambleAndPartialFramesAreRejected() {
        for (String bits : new String[]{"0000000000000000" + FRAME.substring(16), FRAME.substring(0, 30)}) {
            assertTrue(SignalDecoder.decode(synth(48000, 3000, 4000, bits, .02, 0), 48000, 3000, 4000, 0xA17C).frames.isEmpty());
        }
    }

    @Test public void silenceNoiseAndSubWindowBuffersDoNotDecodeOrCrash() {
        for (short[] pcm : new short[][]{new short[900], new short[48000], synth(48000, 3000, 4000, "", 1, .025)}) {
            SignalDecoder.Result result = SignalDecoder.decode(pcm, 48000, 3000, 4000, 0xA17C);
            assertTrue(result.frames.isEmpty());
            assertTrue(Double.isFinite(result.rmsDbfs));
        }
    }

    @Test public void clippingIsReportedIndependentlyOfDecoding() {
        short[] pcm = new short[4800];
        for (int i = 0; i < pcm.length; i++) pcm[i] = (short)(i % 2 == 0 ? Short.MIN_VALUE : Short.MAX_VALUE);
        assertEquals(1, SignalDecoder.decode(pcm, 48000, 3000, 4000, 0).clippedFraction, 0);
    }

    @Test public void frequencyProfileMismatchIsNotAReception() {
        assertTrue(SignalDecoder.decode(synth(48000, 3000, 4000, FRAME, .1, 0), 48000, 17000, 18000, 0xA17C).frames.isEmpty());
    }

    @Test public void invalidInputIsRejected() {
        assertThrows(IllegalArgumentException.class, () -> SignalDecoder.decode(new short[0], 48000, 3000, 4000, 0));
        assertThrows(IllegalArgumentException.class, () -> SignalDecoder.decode(new short[1000], 32000, 19000, 20000, 0));
        assertThrows(IllegalArgumentException.class, () -> SignalDecoder.crc8(65536));
    }
}
