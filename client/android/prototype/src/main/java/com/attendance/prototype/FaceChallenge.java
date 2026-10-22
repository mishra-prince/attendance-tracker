package com.attendance.prototype;

import java.security.SecureRandom;
import java.util.*;

/** Basic active action/continuity checks, not validated presentation-attack detection. */
public final class FaceChallenge {
    public enum Step { CENTER, ACTION, RETURN, CAPTURE, EXPIRED }
    public enum Action { BLINK, SMILE, TURN_LEFT, TURN_RIGHT, LOOK_UP, LOOK_DOWN }
    private Step step = Step.CENTER;
    private final Action[] actions;
    private final long expires;
    private int index, stable, closed, reopened, checkpoint;
    private boolean eyesClosed;
    private Integer track;
    private long lastFrame = -1;

    public static FaceChallenge random(long now, SecureRandom random) {
        List<Action> pool = new ArrayList<>(Arrays.asList(Action.values()));
        Collections.shuffle(pool, random);
        return new FaceChallenge(now, pool.get(0), pool.get(1));
    }
    public FaceChallenge(long now, Action... actions) {
        if (actions.length < 1 || actions.length > 3 || Arrays.asList(actions).contains(null)
            || new HashSet<>(Arrays.asList(actions)).size() != actions.length) throw new IllegalArgumentException("Invalid action sequence");
        this.actions = actions.clone(); expires = now + DemoPolicy.CHALLENGE_MS;
    }
    public Step step() { return step; }
    public int checkpoint() { return checkpoint; }
    public Action[] sequence() { return actions.clone(); }
    public void missing() {
        step = Step.CENTER; index = stable = closed = reopened = 0; eyesClosed = false; track = null;
        // Serial stays monotonic across continuity resets.
    }
    public Step observe(long now, int count, Integer trackingId, float yaw, float pitch, Float left, Float right, Float smile) {
        if (now >= expires || step == Step.EXPIRED) { step = Step.EXPIRED; return step; }
        if (count != 1 || trackingId == null || !Float.isFinite(yaw) || !Float.isFinite(pitch)) { missing(); return step; }
        if (lastFrame >= 0 && (now <= lastFrame || now - lastFrame > 1500)) missing();
        if (track != null && !track.equals(trackingId)) missing();
        track = trackingId; lastFrame = now;
        boolean eyes = left != null && right != null && Float.isFinite(left) && Float.isFinite(right);
        boolean expression = smile != null && Float.isFinite(smile);
        boolean open = eyes && left > .65f && right > .65f;
        boolean shut = eyes && left < .30f && right < .30f;
        boolean frontal = Math.abs(yaw) < 12 && Math.abs(pitch) < 12;
        boolean neutral = frontal && open && expression && smile < .35f;
        switch (step) {
            case CENTER:
                stable = neutral ? stable + 1 : 0;
                if (stable >= 3) { step = Step.ACTION; stable = 0; checkpoint++; }
                break;
            case ACTION:
                boolean hit = false;
                switch (actions[index]) {
                    case BLINK:
                        if (!frontal || !eyes) { stable = closed = reopened = 0; eyesClosed = false; break; }
                        if (shut) { closed++; reopened = 0; if (closed >= 2) eyesClosed = true; }
                        else if (open) {
                            if (eyesClosed && ++reopened >= 2) hit = true;
                            else if (!eyesClosed) closed = 0;
                        } else { closed = reopened = 0; }
                        break;
                    case SMILE: hit = frontal && open && expression && smile > .80f; break;
                    // Front preview is mirrored; inference pixels are not.
                    case TURN_LEFT: hit = yaw > 20 && Math.abs(pitch) < 15; break;
                    case TURN_RIGHT: hit = yaw < -20 && Math.abs(pitch) < 15; break;
                    case LOOK_UP: hit = pitch > 16 && Math.abs(yaw) < 12; break;
                    case LOOK_DOWN: hit = pitch < -16 && Math.abs(yaw) < 12; break;
                    default: break;
                }
                if (actions[index] == Action.BLINK ? hit : (stable = hit ? stable + 1 : 0) >= 3) {
                    step = Step.RETURN; stable = closed = reopened = 0; eyesClosed = false;
                }
                break;
            case RETURN:
                stable = neutral ? stable + 1 : 0;
                if (stable >= 3) {
                    checkpoint++; stable = 0; index++;
                    step = index == actions.length ? Step.CAPTURE : Step.ACTION;
                }
                break;
            case CAPTURE:
                if (!neutral) missing();
                break;
            default: break;
        }
        return step;
    }
    public String instruction() {
        String progress = "Action " + (index + 1) + " of " + actions.length + ": ";
        switch (step) {
            case CENTER: return "Look straight, relax your smile and keep both eyes open.";
            case ACTION:
                switch (actions[index]) {
                    case BLINK: return progress + "blink slowly once. Close, then reopen both eyes.";
                    case SMILE: return progress + "give a clear smile and hold it briefly.";
                    case TURN_LEFT: return progress + "turn your nose towards the LEFT edge of the preview.";
                    case TURN_RIGHT: return progress + "turn your nose towards the RIGHT edge of the preview.";
                    case LOOK_UP: return progress + "raise your chin slightly and look up.";
                    case LOOK_DOWN: return progress + "lower your chin slightly and look down.";
                    default: return progress;
                }
            case RETURN: return "Return to centre, relax your smile and open both eyes.";
            case CAPTURE: return "Hold still — comparing three face samples.";
            default: return "Check timed out. Retry in good light.";
        }
    }
}
