package com.attendance.prototype;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;
import java.security.SecureRandom;
import static com.attendance.prototype.FaceChallenge.Action.*;

public class PrototypeSecurityTest {
    private long clock;
    private FaceChallenge.Step frame(FaceChallenge c,int id,float yaw,float pitch,Float eye,Float smile) {
        clock+=150; return c.observe(clock,1,id,yaw,pitch,eye,eye,smile);
    }
    private void neutral(FaceChallenge c) { for(int i=0;i<3;i++) frame(c,1,0,0,.9f,.1f); }
    private void perform(FaceChallenge c,FaceChallenge.Action action) {
        if(action==BLINK) {
            for(int i=0;i<2;i++) frame(c,1,0,0,.1f,.1f);
            for(int i=0;i<2;i++) frame(c,1,0,0,.9f,.1f);
        } else for(int i=0;i<3;i++) {
            float yaw=action==TURN_LEFT ? 25 : action==TURN_RIGHT ? -25 : 0;
            float pitch=action==LOOK_UP ? 20 : action==LOOK_DOWN ? -20 : 0;
            frame(c,1,yaw,pitch,action==SMILE ? .9f : null,action==SMILE ? .95f : null);
        }
    }
    @Test public void allThirtyDistinctActionOrdersCanComplete() {
        for(FaceChallenge.Action first:FaceChallenge.Action.values()) for(FaceChallenge.Action second:FaceChallenge.Action.values()) if(first!=second) {
            clock=0; FaceChallenge c=new FaceChallenge(0,first,second); neutral(c);
            perform(c,first); assertEquals(FaceChallenge.Step.RETURN,c.step()); neutral(c);
            perform(c,second); assertEquals(FaceChallenge.Step.RETURN,c.step()); neutral(c);
            assertEquals(FaceChallenge.Step.CAPTURE,c.step()); assertEquals(3,c.checkpoint());
        }
    }
    @Test public void randomSequenceAlwaysContainsTwoDistinctActions() {
        SecureRandom random=new SecureRandom();
        for(int i=0;i<100;i++) { FaceChallenge.Action[] a=FaceChallenge.random(0,random).sequence(); assertEquals(2,a.length); assertNotEquals(a[0],a[1]); }
    }
    @Test public void stillOpenEyesCannotSatisfyBlink() {
        FaceChallenge c=new FaceChallenge(0,BLINK); for(int i=0;i<50;i++) frame(c,1,0,0,.9f,.1f);
        assertEquals(FaceChallenge.Step.ACTION,c.step());
    }
    @Test public void singleClosedFrameCannotCompleteBlink() {
        FaceChallenge c=new FaceChallenge(0,BLINK); neutral(c); frame(c,1,0,0,.1f,.1f); neutral(c);
        assertEquals(FaceChallenge.Step.ACTION,c.step());
    }
    @Test public void performingFutureActionDoesNotAdvanceSequence() {
        FaceChallenge c=new FaceChallenge(0,SMILE,TURN_LEFT); neutral(c); perform(c,TURN_LEFT);
        assertEquals(FaceChallenge.Step.ACTION,c.step()); assertEquals(1,c.checkpoint());
    }
    @Test public void wrongTurnDoesNotPass() {
        FaceChallenge c=new FaceChallenge(0,TURN_LEFT); neutral(c); perform(c,TURN_RIGHT);
        assertEquals(FaceChallenge.Step.ACTION,c.step());
    }
    @Test public void smileNeedsNeutralReturnBeforeCapture() {
        FaceChallenge c=new FaceChallenge(0,SMILE); neutral(c); perform(c,SMILE);
        for(int i=0;i<6;i++) frame(c,1,0,0,.9f,.95f);
        assertEquals(FaceChallenge.Step.RETURN,c.step()); neutral(c); assertEquals(FaceChallenge.Step.CAPTURE,c.step());
    }
    @Test public void smileAlreadyPresentAtStartCannotPassBaseline() {
        FaceChallenge c=new FaceChallenge(0,SMILE); for(int i=0;i<8;i++) frame(c,1,0,0,.9f,.95f);
        assertEquals(FaceChallenge.Step.CENTER,c.step());
    }
    @Test public void changedTrackedFaceResetsChallenge() {
        FaceChallenge c=new FaceChallenge(0,TURN_LEFT); neutral(c); frame(c,2,25,0,null,null);
        assertEquals(FaceChallenge.Step.CENTER,c.step());
    }
    @Test public void secondFaceResetsChallenge() {
        FaceChallenge c=new FaceChallenge(0,SMILE); neutral(c);
        c.observe(clock+150,2,1,0,0,.9f,.9f,.1f); assertEquals(FaceChallenge.Step.CENTER,c.step());
    }
    @Test public void missingClassificationCannotPassBaseline() {
        FaceChallenge c=new FaceChallenge(0,SMILE); for(int i=0;i<8;i++) frame(c,1,0,0,null,null);
        assertEquals(FaceChallenge.Step.CENTER,c.step());
    }
    @Test public void nonFrontalClassificationsMayBeUnavailableForPose() {
        FaceChallenge c=new FaceChallenge(0,LOOK_UP); neutral(c); perform(c,LOOK_UP);
        assertEquals(FaceChallenge.Step.RETURN,c.step()); neutral(c); assertEquals(FaceChallenge.Step.CAPTURE,c.step());
    }
    @Test public void stalledFramesResetContinuity() {
        FaceChallenge c=new FaceChallenge(0,SMILE); neutral(c); clock+=2000; frame(c,1,0,0,.9f,.95f);
        assertEquals(FaceChallenge.Step.CENTER,c.step());
    }
    @Test public void nonFinitePoseCannotPass() {
        FaceChallenge c=new FaceChallenge(0,LOOK_UP); neutral(c); frame(c,1,0,Float.NaN,.9f,.1f);
        assertEquals(FaceChallenge.Step.CENTER,c.step());
    }
    @Test public void expiredChallengeCannotBeReused() {
        FaceChallenge c=new FaceChallenge(0,SMILE); neutral(c); perform(c,SMILE); neutral(c);
        assertEquals(FaceChallenge.Step.EXPIRED,c.observe(30_000,1,1,0,0,.9f,.9f,.1f));
    }
    @Test public void checkpointSerialRemainsMonotonicAfterReset() {
        FaceChallenge c=new FaceChallenge(0,SMILE); neutral(c); assertEquals(1,c.checkpoint());
        c.missing(); neutral(c); assertEquals(2,c.checkpoint());
    }
    @Test(expected=IllegalArgumentException.class) public void duplicateActionsAreRejected() { new FaceChallenge(0,SMILE,SMILE); }
    @Test public void actionSequenceCannotBeMutatedExternally() {
        FaceChallenge c=new FaceChallenge(0,SMILE,LOOK_UP); FaceChallenge.Action[] copy=c.sequence(); copy[0]=BLINK;
        assertEquals(SMILE,c.sequence()[0]);
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
