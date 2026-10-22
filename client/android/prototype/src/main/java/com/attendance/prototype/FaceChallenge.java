package com.attendance.prototype;

/** A basic active challenge, NOT a validated presentation-attack detector. */
public final class FaceChallenge {
    public enum Step { CENTER, BLINK, TURN, RETURN, CAPTURE, EXPIRED }
    private Step step = Step.CENTER;
    private final long expires;
    private final int requiredBlinks, direction;
    private int stable, closed, blinks;
    private boolean eyesClosed;
    private Integer track;
    private long lastFrame = -1;

    public FaceChallenge(long now, int requiredBlinks, int direction) {
        this.expires = now + DemoPolicy.CHALLENGE_MS;
        this.requiredBlinks = requiredBlinks;
        this.direction = direction;
    }
    public Step step() { return step; }
    public void missing() {
        step = Step.CENTER; stable = closed = blinks = 0; eyesClosed = false; track = null;
    }
    public Step observe(long now, int count, Integer trackingId, float yaw, Float left, Float right) {
        if (now >= expires || step == Step.EXPIRED) { step = Step.EXPIRED; return step; }
        if (count != 1 || trackingId == null || !Float.isFinite(yaw)) { missing(); return step; }
        if (lastFrame >= 0 && (now <= lastFrame || now - lastFrame > 1500)) missing();
        if (track != null && !track.equals(trackingId)) missing();
        track = trackingId; lastFrame = now;
        boolean eyesAvailable = left != null && right != null && Float.isFinite(left) && Float.isFinite(right);
        // ML Kit only classifies eyes reliably on frontal faces; a turn may return null.
        if (!eyesAvailable && step != Step.TURN && step != Step.RETURN) {
            missing(); return step;
        }
        boolean open = eyesAvailable && left > .65f && right > .65f;
        boolean shut = eyesAvailable && left < .30f && right < .30f;
        boolean centered = Math.abs(yaw) < 12;
        switch (step) {
            case CENTER:
                stable = centered && open ? stable + 1 : 0;
                if (stable >= 3) { step = Step.BLINK; stable = 0; }
                break;
            case BLINK:
                if (!centered) { missing(); break; }
                if (shut) { closed++; if (closed >= 2) eyesClosed = true; stable = 0; }
                else if (open) {
                    if (eyesClosed && ++stable >= 2) {
                        blinks++; closed = stable = 0; eyesClosed = false;
                        if (blinks >= requiredBlinks) step = Step.TURN;
                    } else if (!eyesClosed) closed = 0;
                } else { closed = 0; stable = 0; }
                break;
            case TURN:
                stable = yaw * direction > 20 ? stable + 1 : 0;
                if (stable >= 3) { step = Step.RETURN; stable = 0; }
                break;
            case RETURN:
                stable = centered && open ? stable + 1 : 0;
                if (stable >= 3) step = Step.CAPTURE;
                break;
            case CAPTURE:
                if (!centered || !open) { step = Step.RETURN; stable = 0; }
                break;
            default: break;
        }
        return step;
    }
    public String instruction() {
        switch (step) {
            case CENTER: return "Look straight at the camera. Keep both eyes open.";
            case BLINK: return "Slowly blink " + (requiredBlinks - blinks) + " time(s). Close, then open both eyes.";
            // CameraX mirrors the front-camera preview; inference uses unmirrored pixels.
            case TURN: return direction > 0 ? "Slowly turn your nose toward the LEFT edge of the preview." : "Slowly turn your nose toward the RIGHT edge of the preview.";
            case RETURN: return "Return to the centre. Keep your eyes open.";
            case CAPTURE: return "Hold still — comparing three face samples.";
            default: return "Check timed out. Retry in good light.";
        }
    }
}
