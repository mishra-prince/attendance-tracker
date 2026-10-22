package com.attendance.prototype;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;

public class PrototypeSecurityTest {
    private long clock;
    private FaceChallenge.Step frame(FaceChallenge c,int id,float yaw,float eye) {
        clock+=150; return c.observe(clock,1,id,yaw,eye,eye);
    }
    private void center(FaceChallenge c) { for(int i=0;i<3;i++) frame(c,1,0,.9f); }
    private void blink(FaceChallenge c) {
        for(int i=0;i<2;i++) frame(c,1,0,.1f);
        for(int i=0;i<2;i++) frame(c,1,0,.9f);
    }
    private void finish(FaceChallenge c) {
        for(int i=0;i<3;i++) frame(c,1,25,.9f);
        for(int i=0;i<3;i++) frame(c,1,0,.9f);
    }
    @Test public void fullLiveSequenceCanCapture() {
        FaceChallenge c=new FaceChallenge(0,1,1); center(c); blink(c); finish(c);
        assertEquals(FaceChallenge.Step.CAPTURE,c.step());
    }
    @Test public void stillOpenEyesCannotSatisfyBlink() {
        FaceChallenge c=new FaceChallenge(0,1,1);
        for(int i=0;i<50;i++) frame(c,1,0,.9f);
        assertEquals(FaceChallenge.Step.BLINK,c.step());
    }
    @Test public void singleClosedFrameCannotCompleteBlink() {
        FaceChallenge c=new FaceChallenge(0,1,1); center(c); frame(c,1,0,.1f);
        for(int i=0;i<3;i++) frame(c,1,0,.9f);
        assertEquals(FaceChallenge.Step.BLINK,c.step());
    }
    @Test public void challengeCanRequireTwoBlinks() {
        FaceChallenge c=new FaceChallenge(0,2,1); center(c); blink(c);
        assertEquals(FaceChallenge.Step.BLINK,c.step()); blink(c); finish(c);
        assertEquals(FaceChallenge.Step.CAPTURE,c.step());
    }
    @Test public void wrongTurnDoesNotPass() {
        FaceChallenge c=new FaceChallenge(0,1,1); center(c); blink(c);
        for(int i=0;i<5;i++) frame(c,1,-25,.9f);
        assertEquals(FaceChallenge.Step.TURN,c.step());
    }
    @Test public void changedTrackedFaceResetsChallenge() {
        FaceChallenge c=new FaceChallenge(0,1,1); center(c); blink(c);
        frame(c,2,25,.9f); assertEquals(FaceChallenge.Step.CENTER,c.step());
    }
    @Test public void secondFaceResetsChallenge() {
        FaceChallenge c=new FaceChallenge(0,1,1); center(c); blink(c);
        c.observe(clock+150,2,1,0,.9f,.9f); assertEquals(FaceChallenge.Step.CENTER,c.step());
    }
    @Test public void missingEyeClassificationCannotPass() {
        FaceChallenge c=new FaceChallenge(0,1,1); center(c);
        c.observe(clock+150,1,1,0,null,.9f); assertEquals(FaceChallenge.Step.CENTER,c.step());
    }
    @Test public void stalledFramesResetContinuity() {
        FaceChallenge c=new FaceChallenge(0,1,1); center(c); blink(c);
        clock+=2000; frame(c,1,25,.9f); assertEquals(FaceChallenge.Step.CENTER,c.step());
    }
    @Test public void nonFrontalEyesMayBeUnavailableDuringTurn() {
        FaceChallenge c=new FaceChallenge(0,1,1); center(c); blink(c);
        for(int i=0;i<3;i++) { clock+=150; c.observe(clock,1,1,25,null,null); }
        assertEquals(FaceChallenge.Step.RETURN,c.step());
        for(int i=0;i<3;i++) frame(c,1,0,.9f);
        assertEquals(FaceChallenge.Step.CAPTURE,c.step());
    }
    @Test public void expiredChallengeCannotBeReused() {
        FaceChallenge c=new FaceChallenge(0,1,1); center(c); blink(c); finish(c);
        assertEquals(FaceChallenge.Step.EXPIRED,c.observe(30_000,1,1,0,.9f,.9f));
    }
    @Test public void noBeaconAndExpiredBeaconAreNotFresh() {
        RoomEvidence room=new RoomEvidence(); assertFalse(room.fresh(0)); room.observe(100);
        assertTrue(room.fresh(5099)); assertFalse(room.fresh(5100)); assertFalse(room.fresh(99));
    }
    @Test public void radioSilenceDoesNotAccumulateDwell() {
        RoomEvidence room=new RoomEvidence(); room.observe(0); room.observe(1000); room.observe(60_000);
        assertEquals(1000,room.dwell());
    }
    @Test public void duplicatesAndOldObservationsDoNotAddDwell() {
        RoomEvidence room=new RoomEvidence(); room.observe(500); room.observe(500); room.observe(400);
        assertEquals(0,room.dwell()); assertEquals(1,room.count());
    }
    @Test public void corridorAndWrongCodeBeaconsAreRejected() {
        assertTrue(RoomEvidence.expected(new byte[]{1,1,(byte)0xA1,0x7C}));
        assertFalse(RoomEvidence.expected(new byte[]{1,2,(byte)0xA1,0x7C}));
        assertFalse(RoomEvidence.expected(new byte[]{1,1,(byte)0xA1,0x7D}));
        assertFalse(RoomEvidence.expected(new byte[]{1,1,(byte)0xA1,0x7C,0}));
    }
    private float[] vector(int index,float value) { float[] out=new float[128]; out[index]=value; return out; }
    @Test public void matchingIsScaleIndependent() { assertEquals(1,FaceMath.cosine(vector(0,1),vector(0,10)),1e-6); }
    @Test public void unrelatedVectorsDoNotMatch() { assertEquals(0,FaceMath.cosine(vector(0,1),vector(1,1)),1e-6); }
    @Test(expected=IllegalArgumentException.class) public void emptyEmbeddingFailsClosed() { FaceMath.normalized(new float[128]); }
    @Test(expected=IllegalArgumentException.class) public void corruptEmbeddingFailsClosed() { FaceMath.normalized(vector(0,Float.NaN)); }
    @Test(expected=IllegalArgumentException.class) public void wrongModelDimensionsFailClosed() { FaceMath.normalized(new float[512]); }
    @Test public void normalizedAverageRemainsComparable() {
        assertEquals(1,FaceMath.cosine(vector(0,2),FaceMath.average(Arrays.asList(vector(0,1),vector(0,3),vector(0,5)))),1e-6);
    }
}
