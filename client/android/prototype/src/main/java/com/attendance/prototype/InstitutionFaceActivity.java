package com.attendance.prototype;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.os.*;
import android.util.Base64;
import android.view.*;
import android.widget.*;
import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.camera.core.*;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.face.*;
import org.json.*;
import java.io.ByteArrayOutputStream;
import java.util.concurrent.*;

/** Institutional camera capture. ML Kit guides the user; only the server may accept identity/actions. */
public final class InstitutionFaceActivity extends ComponentActivity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Executor callbacks = command -> { try { worker.execute(command); } catch (RejectedExecutionException e) { command.run(); } };
    private final FacePreparation preparation = new FacePreparation();
    private final JSONArray frames = new JSONArray();
    private FaceDetector detector;
    private ProcessCameraProvider provider;
    private PreviewView preview;
    private TextView instruction, clock, status;
    private Button start;
    private FaceChallenge.Action[] actions;
    private volatile FaceChallenge challenge;
    private volatile boolean running, busy, requested;
    private volatile int generation;
    private int finalFrames, byteCount, closedFrames, openedFrames, blinkStart = -1;
    private long lastFrame, openedAt, startedAt, lastObserved;
    private boolean blinkClosed;
    private Integer track;
    private final ActivityResultLauncher<String> permission = registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
        if (granted) startCamera(); else fail("Camera permission is required for face verification. Ask staff for an alternative if needed.");
    });
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        FaceCaptureBuffer.clear(); openedAt = SystemClock.elapsedRealtime();
        try {
            String[] sequence = getIntent().getStringArrayExtra("actions");
            if (sequence == null || sequence.length != 2 || sequence[0].equals(sequence[1])) throw new IllegalArgumentException();
            actions = new FaceChallenge.Action[]{FaceChallenge.Action.valueOf(sequence[0]), FaceChallenge.Action.valueOf(sequence[1])};
        } catch (Exception e) { fail("Invalid server camera challenge. Start again from Threshold."); return; }
        detector = FaceDetection.getClient(new FaceDetectorOptions.Builder().setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
            .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL).setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
            .enableTracking().setMinFaceSize(.18f).build());
        LinearLayout page = new LinearLayout(this); page.setOrientation(LinearLayout.VERTICAL); page.setPadding(dp(20),dp(34),dp(20),dp(20)); page.setBackgroundColor(Color.rgb(12,11,11));
        page.setOnApplyWindowInsetsListener((v,insets) -> { page.setPadding(dp(20),dp(16)+insets.getSystemWindowInsetTop(),dp(20),dp(16)+insets.getSystemWindowInsetBottom()); return insets; });
        ScrollView scroll = new ScrollView(this); scroll.addView(page); setContentView(scroll);
        label(page, "THRESHOLD · LIVE FACE", 13);
        label(page, "ENROLL".equals(getIntent().getStringExtra("purpose")) || "REENROLL".equals(getIntent().getStringExtra("purpose")) ? "Supervised face capture" : "Verify your identity", 25);
        label(page, "Use front lighting. Keep one person visible. Tap Start when ready; capture is automatic after each action.", 14);
        instruction = label(page, "Starting the front camera…", 18);
        clock = label(page, "Preparation · action timer has not started", 13);
        start = new Button(this); start.setText("Start face capture"); start.setEnabled(false); page.addView(start);
        start.setOnClickListener(v -> { requested = true; start.setEnabled(false); });
        preview = new PreviewView(this); preview.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        page.addView(preview, new LinearLayout.LayoutParams(-1,dp(260)));
        status = label(page, "Images are sent securely to your institution for matching. They are not saved to your gallery.", 13);
        Button cancel = new Button(this); cancel.setText("Cancel"); page.addView(cancel); cancel.setOnClickListener(v -> fail("Face check cancelled. No face result was recorded."));
        if (ContextCompat.checkSelfPermission(this,Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) startCamera();
        else permission.launch(Manifest.permission.CAMERA);
        main.post(tick);
    }
    private int dp(int n) { return Math.round(n * getResources().getDisplayMetrics().density); }
    private TextView label(LinearLayout page,String text,int size) { TextView v = new TextView(this); v.setText(text); v.setTextSize(size); v.setTextColor(Color.rgb(239,234,231)); v.setPadding(0,dp(7),0,dp(7)); page.addView(v); return v; }
    private final Runnable tick = new Runnable() { public void run() {
        if (isFinishing() || isDestroyed()) return;
        long now = SystemClock.elapsedRealtime(), remaining = challenge == null ? 60_000 - (now-openedAt) : challenge.remaining(now);
        if (remaining <= 0) { fail("Face capture timed out. Start a new check in good light; no attendance was changed."); return; }
        clock.setText((challenge == null ? "Preparation · " : "Automatic capture · ") + (remaining+999)/1000 + " seconds remaining");
        main.postDelayed(this,250);
    }};
    private void startCamera() {
        if (isFinishing() || running) return;
        running = true; int token = ++generation;
        com.google.common.util.concurrent.ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            if (!running || token != generation) return;
            try {
                provider = future.get(); provider.unbindAll();
                Preview live = new Preview.Builder().build(); live.setSurfaceProvider(preview.getSurfaceProvider());
                ImageAnalysis analysis = new ImageAnalysis.Builder().setTargetResolution(new android.util.Size(640,480))
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build();
                analysis.setAnalyzer(worker,image -> analyze(image,token));
                provider.bindToLifecycle(this,CameraSelector.DEFAULT_FRONT_CAMERA,live,analysis);
            } catch(Exception e) { fail("Front camera unavailable. Ask staff for assisted verification."); }
        },ContextCompat.getMainExecutor(this));
    }
    private void analyze(ImageProxy proxy,int token) {
        long now = SystemClock.elapsedRealtime();
        if (!running || token != generation || busy || now-lastFrame < 120) { proxy.close(); return; }
        busy = true; lastFrame = now; Bitmap raw = null;
        try {
            raw = proxy.toBitmap(); Matrix matrix = new Matrix(); matrix.postRotate(proxy.getImageInfo().getRotationDegrees());
            Bitmap frame = Bitmap.createBitmap(raw,0,0,raw.getWidth(),raw.getHeight(),matrix,false);
            if (raw != frame) raw.recycle(); proxy.close();
            detector.process(InputImage.fromBitmap(frame,0)).addOnSuccessListener(callbacks,faces -> {
                try {
                    if (!running || token != generation) return;
                    Face face = faces.size() == 1 ? faces.get(0) : null;
                    long at = SystemClock.elapsedRealtime(); Integer tracking = face == null ? null : face.getTrackingId();
                    float yaw = face == null ? 0 : face.getHeadEulerAngleY(), pitch = face == null ? 0 : face.getHeadEulerAngleX();
                    Float left = face == null ? null : face.getLeftEyeOpenProbability(), right = face == null ? null : face.getRightEyeOpenProbability(), smile = face == null ? null : face.getSmilingProbability();
                    String hint = FaceChallenge.neutralHint(faces.size(),tracking,yaw,pitch,left,right,smile);
                    if (hint == null && face.getBoundingBox().width() < 100) hint = "Move closer so your face fills more of the preview.";
                    if (challenge == null) {
                        preparation.observe(at,tracking,hint); boolean ready = preparation.ready(at);
                        String guidance = hint != null ? hint : ready ? "Ready. Tap Start face capture." : "Hold still for a moment.";
                        main.post(() -> { if (running && token == generation) { instruction.setText(guidance); start.setEnabled(ready); } });
                        if (!requested) return; requested = false;
                        if (!ready) return;
                        startedAt = at; challenge = new FaceChallenge(at,90_000,actions);
                        main.post(() -> start.setVisibility(View.GONE));
                    }
                    FaceChallenge.Step before = challenge.step(); FaceChallenge.Action action = challenge.currentAction();
                    boolean continuityLost = tracking == null || track != null && !track.equals(tracking) || faces.size() != 1 || lastObserved > 0 && at-lastObserved > 1500;
                    lastObserved = at;
                    FaceChallenge.Step step = challenge.observe(at,faces.size(),tracking,yaw,pitch,left,right,smile); track = tracking;
                    if (continuityLost || step == FaceChallenge.Step.CENTER && before != FaceChallenge.Step.CENTER) resetFrames();
                    boolean retain = hint == null && (before == FaceChallenge.Step.CENTER || before == FaceChallenge.Step.RETURN || before == FaceChallenge.Step.CAPTURE);
                    if (before == FaceChallenge.Step.ACTION && !continuityLost && action != null) {
                        boolean frontal = Math.abs(yaw) < 12 && Math.abs(pitch) < 12;
                        switch(action) {
                            case BLINK:
                                if (blinkStart < 0) blinkStart = frames.length();
                                if (frontal && left != null && right != null && left < .30f && right < .30f) { blinkClosed = true; retain = closedFrames++ < 2; }
                                else retain = blinkClosed && frontal && left != null && right != null && left > .65f && right > .65f && openedFrames++ < 2;
                                if (step == FaceChallenge.Step.ACTION && !challenge.blinkClosureConfirmed() && !(frontal && left != null && right != null && left < .30f && right < .30f)) {
                                    while(frames.length() > blinkStart) { JSONObject removed = (JSONObject)frames.remove(frames.length()-1); byteCount -= removed.optString("jpeg").length(); }
                                    closedFrames = openedFrames = 0; blinkClosed = false; retain = false;
                                }
                                break;
                            case SMILE: retain = frontal && smile != null && smile > .80f; break;
                            case TURN_LEFT: retain = yaw > 20 && Math.abs(pitch) < 15; break;
                            case TURN_RIGHT: retain = yaw < -20 && Math.abs(pitch) < 15; break;
                            case LOOK_UP: retain = pitch > 16 && Math.abs(yaw) < 12; break;
                            case LOOK_DOWN: retain = pitch < -16 && Math.abs(yaw) < 12; break;
                        }
                    }
                    if (step != before) { blinkClosed = false; closedFrames = openedFrames = 0; blinkStart = -1; }
                    if (retain && !continuityLost) saveFrame(frame,at-startedAt);
                    if (step == FaceChallenge.Step.EXPIRED) { main.post(() -> fail("Camera check expired. Please retry.")); return; }
                    if (step == FaceChallenge.Step.CAPTURE && ++finalFrames >= 3) {
                        JSONObject packet = new JSONObject().put("frames",frames);
                        String resultToken = FaceCaptureBuffer.put(packet.toString());
                        main.post(() -> { if (running && token == generation) {
                            stopCamera(); setResult(RESULT_OK,new Intent().putExtra("captureToken",resultToken)); finish();
                        } else FaceCaptureBuffer.clear(); }); return;
                    }
                    String guidance = (step == FaceChallenge.Step.CENTER || step == FaceChallenge.Step.RETURN) && hint != null ? hint : challenge.instruction();
                    main.post(() -> { if (running && token == generation) instruction.setText(guidance); });
                } catch(Exception e) { main.post(() -> fail("Could not capture a clear sequence. Please retry in good light.")); }
                finally { frame.recycle(); if (token == generation) busy = false; }
            }).addOnFailureListener(callbacks,e -> { frame.recycle(); if (token == generation) busy = false; main.post(() -> fail("Face detector unavailable. Please retry or ask staff for assistance.")); });
        } catch(Exception e) { if (raw != null && !raw.isRecycled()) raw.recycle(); proxy.close(); busy = false; main.post(() -> fail("Camera frame unavailable. Please retry.")); }
    }
    private void saveFrame(Bitmap frame,long at) throws Exception {
        if (frames.length() >= 32) throw new IllegalStateException();
        int side = Math.max(frame.getWidth(),frame.getHeight());
        Bitmap small = side > 640 ? Bitmap.createScaledBitmap(frame,frame.getWidth()*640/side,frame.getHeight()*640/side,true) : frame;
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(); small.compress(Bitmap.CompressFormat.JPEG,82,bytes);
        if (small != frame) small.recycle(); byte[] jpeg = bytes.toByteArray();
        if (jpeg.length > 180_000) throw new IllegalStateException();
        String data = Base64.encodeToString(jpeg,Base64.NO_WRAP); java.util.Arrays.fill(jpeg,(byte)0);
        byteCount += data.length(); if (byteCount > 4_000_000) throw new IllegalStateException();
        frames.put(new JSONObject().put("atMs",at).put("jpeg",data));
    }
    private void resetFrames() { while(frames.length() > 0) frames.remove(frames.length()-1); byteCount = finalFrames = closedFrames = openedFrames = 0; blinkClosed = false; blinkStart = -1; }
    private void stopCamera() { running = false; generation++; if (provider != null) provider.unbindAll(); main.removeCallbacks(tick); getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); }
    private void fail(String message) { if (isFinishing()) return; stopCamera(); FaceCaptureBuffer.clear(); setResult(RESULT_CANCELED,new Intent().putExtra("error",message)); finish(); }
    @Override protected void onPause() { super.onPause(); if (running) fail("Camera check interrupted. Keep Threshold visible and start again."); }
    @Override protected void onDestroy() { stopCamera(); if (detector != null) detector.close(); worker.execute(this::resetFrames); worker.shutdown(); super.onDestroy(); }
}
