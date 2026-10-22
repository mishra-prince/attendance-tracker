package com.attendance.prototype;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.bluetooth.*;
import android.bluetooth.le.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.os.*;
import android.provider.Settings;
import android.text.InputType;
import android.view.*;
import android.widget.*;
import androidx.activity.ComponentActivity;
import androidx.camera.core.*;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.face.*;
import org.json.JSONObject;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.*;

/** Offline submission demonstrator. It never writes institutional attendance. */
public final class PrototypeActivity extends ComponentActivity {
    private static final int BONE = Color.rgb(245,241,238), ASH = Color.rgb(172,166,163), RED = Color.rgb(255,69,58);
    private static final ParcelUuid SERVICE = ParcelUuid.fromString("a2f2a5d0-558e-4c89-993a-d93215ef98f1");
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    // Late detector callbacks must still recycle their frame after the activity closes.
    private final Executor detectorCallbacks = command -> {
        try { worker.execute(command); }
        catch (RejectedExecutionException stopped) { command.run(); }
    };
    private final SecureRandom random = new SecureRandom();
    private final RoomEvidence room = new RoomEvidence();
    private EnrollmentStore store;
    private FaceEngine engine;
    private FaceDetector detector;
    private ProcessCameraProvider provider;
    private BluetoothLeScanner scanner;
    private LinearLayout content;
    private TextView roomText, statusText, instruction, timerText;
    private Button checkButton;
    private PreviewView preview;
    private boolean ready, scanning, resumed;
    private volatile boolean cameraRunning, busy;
    private volatile int generation;
    private int pinAttempts;
    private long lastFrame, pinRetryAt, classStart = -1, midAt;
    private boolean joinPassed, middlePassed, midRequested;
    private String cameraPurpose = "", message = "Models are loading for offline use…";
    private String pendingName, pendingRoll, pendingSupervisor;
    private char[] pendingPin;
    private static final class Attempt {
        final FaceChallenge challenge;
        final List<float[]> samples = new ArrayList<>();
        final float[] reference;
        float[] challengeIdentity;
        int lastCheckpoint;
        double minimumScore = 1;
        Attempt(FaceChallenge challenge, float[] reference) { this.challenge=challenge; this.reference=reference; }
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        store = new EnrollmentStore(this);
        detector = FaceDetection.getClient(new FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
            .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
            .enableTracking().setMinFaceSize(.18f).build());
        showHome();
        worker.execute(() -> {
            try { engine = new FaceEngine(this); main.post(() -> { if(isFinishing() || isDestroyed()) return; ready = true; message = "Ready. Set up a supervised demo identity first."; showHome(); }); }
            catch (Exception | LinkageError error) { main.post(() -> { if(isFinishing() || isDestroyed()) return; message = "Face models unavailable: " + error.getMessage() + ". Use an ARM Android phone."; showHome(); }); }
        });
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private GradientDrawable panel(int color, int radius) {
        GradientDrawable background = new GradientDrawable(); background.setColor(color);
        background.setCornerRadius(dp(radius)); background.setStroke(dp(1), Color.rgb(58,54,54)); return background;
    }
    private void page(String eyebrow, String title, String subtitle) {
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setBackgroundColor(Color.rgb(10,9,8));
        content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(dp(22),dp(20),dp(22),dp(30));
        scroll.addView(content); setContentView(scroll);
        scroll.setOnApplyWindowInsetsListener((view, insets) -> {
            content.setPadding(dp(22),dp(20)+insets.getSystemWindowInsetTop(),dp(22),dp(30)+insets.getSystemWindowInsetBottom()); return insets;
        });
        label(eyebrow, 12, RED); label(title, 34, BONE); label(subtitle,14,ASH); gap(16);
    }
    private TextView label(String text, int size, int color) {
        TextView view = new TextView(this); view.setText(text); view.setTextSize(size); view.setTextColor(color);
        view.setPadding(0,dp(5),0,dp(5)); content.addView(view); return view;
    }
    private TextView card(String text) {
        TextView view = label(text,15,BONE); view.setPadding(dp(18),dp(16),dp(18),dp(16));
        view.setBackground(panel(Color.rgb(28,27,30),22)); gap(10); return view;
    }
    private void gap(int height) { content.addView(new View(this),new LinearLayout.LayoutParams(1,dp(height))); }
    private Button button(String title, boolean primary, Runnable action) {
        Button button = new Button(this); button.setText(title); button.setTextColor(BONE); button.setTextSize(15); button.setAllCaps(false);
        button.setMinHeight(dp(54)); button.setBackground(panel(primary ? Color.rgb(179,18,23) : Color.rgb(28,27,30),27));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1,dp(56)); params.bottomMargin=dp(10); content.addView(button,params);
        button.setOnClickListener(v -> action.run()); return button;
    }
    private void showHome() {
        page("THRESHOLD / CLASSROOM DEMO", "Presence, with identity.", "Inside your Threshold app • ESP32-S3 + face matching");
        String identity = "01  /  SUPERVISED DEMO IDENTITY\nNot enrolled on this phone";
        if (store.exists()) {
            try { JSONObject record=store.read(); identity="01  /  SUPERVISED DEMO IDENTITY\n"+record.getString("name")+" · "+record.getString("roll")+"\nEncrypted face template saved locally"; }
            catch (Exception error) { identity="Enrollment cannot be read. Clear app data and repeat supervised demo setup."; }
        }
        card(identity);
        roomText=card("02  /  ESP32 ROOM SIGNAL\nTap Find ESP32 to scan for inside beacon A17C");
        card("03  /  IDENTITY CHECK\nReal SFace matching + two random actions\nTurn, look up/down, smile or blink\nCamera runs only during a check");
        statusText=card(message);
        button("Find ESP32",false,this::beginScan);
        button(store.exists() ? "Supervisor: manage demo identity" : "Supervisor: enrol demo identity",false,this::supervisorGate).setEnabled(ready);
        button("Start 60-second class demo",true,this::startClass).setEnabled(ready && store.exists());
        button("Test face verification only",false,() -> {
            if (!store.exists()) { notice("Enroll a supervised demo identity first."); return; }
            beginFace("face-test");
        }).setEnabled(ready);
        button("Demo guide & limitations",false,this::guide);
        button("Back to Threshold portal",false,this::finish);
        label("Demo results stay on this phone. No institutional attendance is awarded. Keep the app in the foreground.",12,ASH);
    }
    private void guide() {
        new AlertDialog.Builder(this).setTitle("Tomorrow’s demonstration")
            .setMessage("1. Flash RoomLabBeacon on the S3 (role 1, A17C), then power it by USB.\n\n2. Supervisor verifies a consenting volunteer’s ID and saves their face with a private PIN.\n\n3. Enable Bluetooth and find the ESP32. Start the 60-second class. Complete the join face check and one randomly timed middle check.\n\n4. Try a different person and switch off the ESP32 to show neutral review outcomes.\n\nThis offline classroom demo is inside the same Threshold app. Portal attendance is separate. BLE reaches through walls and cannot reject a corridor seat. The unsigned lab beacon can be copied. Random action challenges are basic and do not stop all video/deepfake/camera-injection attacks. No 95% result is claimed. iPhone and locked-phone attendance are not implemented. Initial PIN setup is a demo convention, not authenticated college staff access. Uninstall or supervised delete removes local identity.")
            .setPositiveButton("Understood",null).show();
    }
    private void notice(String text) { message=text; if (statusText!=null) statusText.setText(text); Toast.makeText(this,text,Toast.LENGTH_LONG).show(); }
    private String[] neededPermissions() {
        return Build.VERSION.SDK_INT >= 31
            ? new String[]{Manifest.permission.CAMERA,Manifest.permission.BLUETOOTH_SCAN,Manifest.permission.BLUETOOTH_CONNECT,Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION}
            : new String[]{Manifest.permission.CAMERA,Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION};
    }
    private boolean permissions() {
        return permissions(true);
    }
    private boolean permissions(boolean includeBluetooth) {
        List<String> needed=new ArrayList<>();
        String[] required=includeBluetooth ? neededPermissions() : new String[]{Manifest.permission.CAMERA};
        for(String permission:required) if(checkSelfPermission(permission)!=PackageManager.PERMISSION_GRANTED) needed.add(permission);
        if(needed.isEmpty()) return true;
        requestPermissions(needed.toArray(new String[0]),45); return false;
    }
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results) {
        super.onRequestPermissionsResult(code,permissions,results);
        if(code==45) notice("Permissions updated. Tap your action again. Camera and nearby devices are required for the full demo.");
    }
    @SuppressLint("MissingPermission") private void beginScan() {
        if(!permissions()) return;
        try {
            BluetoothManager manager=getSystemService(BluetoothManager.class);
            BluetoothAdapter adapter=manager==null ? null : manager.getAdapter();
            if(adapter==null) { notice("Bluetooth LE is unavailable. Face-only testing still works."); return; }
            if(!adapter.isEnabled()) { startActivity(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)); return; }
            android.location.LocationManager location=getSystemService(android.location.LocationManager.class);
            boolean locationEnabled=Build.VERSION.SDK_INT>=28 ? location.isLocationEnabled() : location.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) || location.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER);
            if(!locationEnabled) {
                notice("Enable Location services for this classroom Bluetooth scan. No GPS coordinates are collected."); startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)); return;
            }
            if(scanning) { notice("Scanning for inside beacon A17C…"); return; }
            scanner=adapter.getBluetoothLeScanner();
            if(scanner==null) { notice("Bluetooth scanner unavailable. Toggle Bluetooth and retry."); return; }
            room.reset();
            scanner.startScan(Collections.singletonList(new ScanFilter.Builder().setServiceUuid(SERVICE).build()),
                new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).setReportDelay(0).build(),scanCallback);
            scanning=true; main.removeCallbacks(scanTimeout); main.postDelayed(scanTimeout,120_000);
            notice("Scanning. Keep ESP32 powered; role 1, study code A17C."); updateRoom();
        } catch(Exception error) { notice("Bluetooth could not start: "+error.getMessage()); stopScan(); }
    }
    private final Runnable scanTimeout=() -> {
        if(classStart<0) { stopScan(); notice("Idle scan stopped to save battery. Tap Find ESP32 to resume."); updateRoom(); }
    };
    private final ScanCallback scanCallback=new ScanCallback() {
        @Override public void onScanResult(int type,ScanResult result) {
            if(!scanning || result.getScanRecord()==null) return;
            long age=SystemClock.elapsedRealtimeNanos()-result.getTimestampNanos();
            if(age<0 || age>2_000_000_000L || !RoomEvidence.expected(result.getScanRecord().getManufacturerSpecificData(0xffff))) return;
            room.observe(SystemClock.elapsedRealtime()-age/1_000_000); updateRoom();
        }
        @Override public void onScanFailed(int error) { scanning=false; room.reset(); notice("Bluetooth scan unavailable ("+error+"). Retry or use face-only test."); updateRoom(); }
    };
    @SuppressLint("MissingPermission") private void stopScan() {
        if(scanning && scanner!=null) try { scanner.stopScan(scanCallback); } catch(Exception ignored) { /* permission/Bluetooth may have changed */ }
        scanning=false; room.reset(); main.removeCallbacks(scanTimeout);
    }
    private void updateRoom() {
        if(roomText!=null) roomText.setText("02  /  ESP32 ROOM SIGNAL\n"+(scanning && room.fresh(SystemClock.elapsedRealtime()) ? "Inside beacon detected · A17C" : "No fresh inside beacon")+"\nObserved dwell: "+room.dwell()/1000+" s · "+room.count()+" readings\nProximity evidence; corridor boundary unproven");
    }
    private EditText field(LinearLayout box,String hint,boolean pin) {
        EditText input=new EditText(this); input.setHint(hint); input.setSingleLine(true);
        input.setInputType(pin ? InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_VARIATION_PASSWORD : InputType.TYPE_CLASS_TEXT);
        box.addView(input); return input;
    }
    private void supervisorGate() {
        if(!store.exists()) { enrollmentForm(); return; }
        if(SystemClock.elapsedRealtime()<pinRetryAt) { notice("Wait 30 seconds before another PIN attempt."); return; }
        LinearLayout box=new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(24),0,dp(24),0);
        EditText pin=field(box,"Supervisor demo PIN",true);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Supervisor access").setView(box).setPositiveButton("Unlock",null).setNegativeButton("Cancel",null).create();
        dialog.setOnShowListener(d -> dialog.getButton(-1).setOnClickListener(v -> {
            char[] entered=pin.getText().toString().toCharArray(); pin.setText(""); dialog.getButton(-1).setEnabled(false);
            worker.execute(() -> {
                try {
                    boolean correct=store.unlock(entered);
                    main.post(() -> {
                        dialog.dismiss();
                        if(!correct) { if(++pinAttempts>=5) { pinRetryAt=SystemClock.elapsedRealtime()+30_000; pinAttempts=0; } notice("PIN did not match. No enrollment changed."); return; }
                        pinAttempts=0;
                        new AlertDialog.Builder(this).setTitle("Delete demo identity?").setMessage("This deletes the encrypted face template and supervisor PIN. A fresh supervised setup will be needed.")
                            .setPositiveButton("Delete",(a,b) -> { try { store.delete(); message="Demo identity deleted."; showHome(); } catch(Exception e) { notice("Deletion failed."); } }).setNegativeButton("Keep",null).show();
                    });
                } catch(Exception error) { main.post(() -> { dialog.dismiss(); notice("Could not read enrollment. Clear app data for a supervised reset."); }); }
            });
        })); dialog.show();
    }
    private void enrollmentForm() {
        if(!permissions(false)) return;
        LinearLayout box=new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(24),0,dp(24),0);
        EditText name=field(box,"Volunteer name",false),roll=field(box,"Demo roll number",false),staff=field(box,"Supervising staff name",false),pin=field(box,"Private supervisor PIN (6+ digits)",true);
        CheckBox consent=new CheckBox(this); consent.setText("I am the demo supervisor. I checked the volunteer’s ID in person and have their consent to save a local face template."); box.addView(consent);
        TextView note=new TextView(this); note.setText("Local submission demo only. This setup does not authenticate college staff or create an institutional identity."); box.addView(note);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Supervised demo enrollment").setView(box).setPositiveButton("Capture live face",null).setNegativeButton("Cancel",null).create();
        dialog.setOnShowListener(d -> dialog.getButton(-1).setOnClickListener(v -> {
            if(name.getText().toString().trim().isEmpty() || roll.getText().toString().trim().isEmpty() || staff.getText().toString().trim().isEmpty() || !pin.getText().toString().matches("[0-9]{6,20}") || !consent.isChecked()) {
                Toast.makeText(this,"Complete every field, use a 6–20 digit PIN and confirm supervised consent.",Toast.LENGTH_LONG).show(); return;
            }
            pendingName=name.getText().toString().trim(); pendingRoll=roll.getText().toString().trim(); pendingSupervisor=staff.getText().toString().trim(); pendingPin=pin.getText().toString().toCharArray();
            pin.setText(""); dialog.dismiss(); beginFace("enroll");
        })); dialog.show();
    }
    private void startClass() {
        if(!permissions()) return;
        if(!scanning || !room.fresh(SystemClock.elapsedRealtime()) || room.dwell()<2000) { notice("Find the ESP32 and wait for at least 2 seconds of fresh readings first."); if(!scanning) beginScan(); return; }
        classStart=-1; joinPassed=middlePassed=midRequested=false; beginFace("join");
    }
    private void classPage() {
        page("THRESHOLD / LIVE CLASS DEMO", "You’re checked in.", "60 seconds • one staggered identity check • foreground only");
        timerText=label("60",80,BONE);
        roomText=card(""); updateRoom();
        statusText=card("Join identity check passed. A middle check will appear at a random time.");
        checkButton=button("Waiting for the middle check…",true,() -> beginFace("middle")); checkButton.setEnabled(false);
        button("End demo",false,() -> finishClass("REVIEW REQUIRED\nDemo ended early. No real attendance changed."));
        label("The display dims while waiting. The app cannot lock your personal phone. Camera stays off until the check.",13,ASH);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
    private final Runnable tick=new Runnable() {
        @Override public void run() {
            if(classStart<0 || !resumed) return;
            long now=SystemClock.elapsedRealtime(), elapsed=now-classStart;
            if(timerText!=null) timerText.setText(Long.toString(Math.max(0,(DemoPolicy.CLASS_MS-elapsed+999)/1000)));
            updateRoom();
            if(!midRequested && elapsed>=midAt) {
                midRequested=true; brightness(-1);
                if(statusText!=null) statusText.setText("Middle identity check is ready. Complete it before the demo ends.");
                if(checkButton!=null) { checkButton.setText("Verify my face now"); checkButton.setEnabled(true); }
                getWindow().getDecorView().performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
            }
            if(elapsed>=DemoPolicy.CLASS_MS) {
                boolean pass=joinPassed && middlePassed && scanning && room.fresh(now) && room.dwell()>=DemoPolicy.MIN_DWELL_MS;
                finishClass(pass ? "DEMO CHECKS COMPLETE\nTwo face checks matched and sufficient fresh ESP32 proximity was observed. Local demonstration only; classroom boundary and anti-spoof reliability remain unvalidated."
                    : "REVIEW REQUIRED\nA face check or sufficient fresh Bluetooth evidence was missing. This is a technical/demo outcome, not evidence of cheating."); return;
            }
            if(!midRequested && elapsed>8000) brightness(.12f);
            main.postDelayed(this,500);
        }
    };
    private void brightness(float value) { WindowManager.LayoutParams params=getWindow().getAttributes(); params.screenBrightness=value; getWindow().setAttributes(params); }
    private void finishClass(String outcome) {
        long dwell=room.dwell(); classStart=-1; main.removeCallbacks(tick); stopCamera(); stopScan(); brightness(-1);
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        message=outcome+"\nObserved dwell: "+dwell/1000+" s.\nJoin face: "+joinPassed+" · Middle face: "+middlePassed;
        showHome();
    }
    private void beginFace(String purpose) {
        if(!ready || !permissions(purpose.equals("join") || purpose.equals("middle"))) return;
        if((purpose.equals("join") || purpose.equals("middle")) && (!scanning || !room.fresh(SystemClock.elapsedRealtime()))) { notice("No fresh ESP32 signal. Restore Bluetooth/power, then retry."); return; }
        final float[] reference;
        try { reference=purpose.equals("enroll") ? null : store.template(); }
        catch(Exception error) { notice("No readable face enrollment. Visit supervisor setup."); return; }
        stopCamera(); cameraPurpose=purpose;
        Attempt attempt=new Attempt(FaceChallenge.random(SystemClock.elapsedRealtime(),random),reference);
        page("THRESHOLD / LIVE IDENTITY",purpose.equals("enroll") ? "Meet your demo identity." : "A quick face check.","Face a light source. Keep one face visible. No photo is saved.");
        preview=new PreviewView(this); preview.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        content.addView(preview,new LinearLayout.LayoutParams(-1,dp(290)));
        instruction=card(attempt.challenge.instruction()); statusText=label("Two randomized actions · offline face comparison",13,ASH);
        button("Cancel check",false,() -> faceFailure("Face check cancelled. Retry when ready."));
        brightness(-1); getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        int token=++generation; cameraRunning=true; busy=false;
        com.google.common.util.concurrent.ListenableFuture<ProcessCameraProvider> future=ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            if(token!=generation || !cameraRunning) return;
            try {
                provider=future.get(); provider.unbindAll();
                Preview live=new Preview.Builder().build(); live.setSurfaceProvider(preview.getSurfaceProvider());
                ImageAnalysis analysis=new ImageAnalysis.Builder().setTargetResolution(new android.util.Size(640,480)).setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build();
                analysis.setAnalyzer(worker,image -> analyze(image,token,attempt,purpose));
                provider.bindToLifecycle(this,CameraSelector.DEFAULT_FRONT_CAMERA,live,analysis);
                main.postDelayed(() -> { if(token==generation && cameraRunning) faceFailure("Face check timed out. Retry in good light."); },DemoPolicy.CHALLENGE_MS);
            } catch(Exception error) { faceFailure("Front camera unavailable: "+error.getMessage()); }
        },ContextCompat.getMainExecutor(this));
    }
    private void analyze(ImageProxy proxy,int token,Attempt attempt,String purpose) {
        long now=SystemClock.elapsedRealtime();
        if(token!=generation || !cameraRunning || busy || now-lastFrame<120) { proxy.close(); return; }
        lastFrame=now; busy=true;
        Bitmap raw=null;
        try {
            raw=proxy.toBitmap();
            Matrix rotation=new Matrix(); rotation.postRotate(proxy.getImageInfo().getRotationDegrees());
            Bitmap frame=Bitmap.createBitmap(raw,0,0,raw.getWidth(),raw.getHeight(),rotation,false);
            if(frame!=raw) raw.recycle(); proxy.close();
            detector.process(InputImage.fromBitmap(frame,0)).addOnSuccessListener(detectorCallbacks,faces -> {
                try {
                    if(token!=generation || !cameraRunning) return;
                    Face face=faces.size()==1 ? faces.get(0) : null;
                    FaceChallenge.Step previous=attempt.challenge.step();
                    FaceChallenge.Step step=attempt.challenge.observe(SystemClock.elapsedRealtime(),faces.size(),face==null?null:face.getTrackingId(),face==null?0:face.getHeadEulerAngleY(),face==null?0:face.getHeadEulerAngleX(),face==null?null:face.getLeftEyeOpenProbability(),face==null?null:face.getRightEyeOpenProbability(),face==null?null:face.getSmilingProbability());
                    if(step!=FaceChallenge.Step.CAPTURE || previous!=FaceChallenge.Step.CAPTURE) attempt.samples.clear();
                    String hint=faces.size()!=1 ? "Show exactly one face. Check your lighting." : attempt.challenge.instruction();
                    main.post(() -> { if(token==generation && instruction!=null) instruction.setText(hint); });
                    if(step==FaceChallenge.Step.EXPIRED) { main.post(() -> { if(token==generation) faceFailure("Face check expired. Retry."); }); return; }
                    boolean identityCheckpoint = attempt.challenge.checkpoint() > attempt.lastCheckpoint;
                    if(step!=FaceChallenge.Step.CAPTURE && !identityCheckpoint) return;
                    float[] vector=engine.embedding(frame);
                    double score=attempt.reference==null ? 1 : FaceMath.cosine(attempt.reference,vector);
                    if(attempt.reference!=null && score<DemoPolicy.MATCH_COSINE) {
                        main.post(() -> { if(token==generation) faceFailure("FACE DID NOT MATCH\nUse the enrolled volunteer, or ask the supervisor to check the enrollment. No attendance was changed."); }); return;
                    }
                    if(attempt.challengeIdentity!=null && FaceMath.cosine(attempt.challengeIdentity,vector)<.70) {
                        main.post(() -> { if(token==generation) faceFailure("Face changed during the challenge. Retry with the same enrolled person throughout."); }); return;
                    }
                    if(attempt.challengeIdentity==null) attempt.challengeIdentity=vector.clone();
                    attempt.lastCheckpoint=attempt.challenge.checkpoint();
                    attempt.minimumScore=Math.min(attempt.minimumScore,score);
                    if(step!=FaceChallenge.Step.CAPTURE) return;
                    attempt.samples.add(vector);
                    if(attempt.samples.size()>=DemoPolicy.SAMPLES) {
                        float[] template=FaceMath.average(attempt.samples);
                        main.post(() -> { if(token==generation && cameraRunning) faceSuccess(purpose,template,attempt.minimumScore); });
                    }
                } catch(Exception error) {
                    attempt.samples.clear(); attempt.challenge.missing(); attempt.challengeIdentity=null;
                    main.post(() -> { if(token==generation && instruction!=null) instruction.setText("Could not compare this frame. "+error.getMessage()); });
                } finally { frame.recycle(); busy=false; }
            }).addOnFailureListener(detectorCallbacks,error -> {
                frame.recycle(); busy=false;
                main.post(() -> { if(token==generation) faceFailure("Face detector unavailable. Retry or use a supported Android phone."); });
            });
        } catch(Exception error) {
            if(raw!=null && !raw.isRecycled()) raw.recycle(); proxy.close(); busy=false;
            main.post(() -> { if(token==generation) faceFailure("Camera frame unavailable. Retry the check."); });
        }
    }
    private void faceSuccess(String purpose,float[] template,double minimumScore) {
        stopCamera();
        if(purpose.equals("enroll")) {
            try { store.save(pendingName,pendingRoll,pendingSupervisor,pendingPin,template); }
            catch(Exception error) { clearPendingPin(); message="Could not save enrollment. Repeat supervised setup. "+error.getMessage(); showHome(); return; }
            clearPendingPin(); message="Supervised DEMO face enrollment saved. No raw photo was stored. Now find the ESP32."; showHome(); return;
        }
        if(purpose.equals("face-test")) { message=String.format(Locale.US,"FACE MATCHED · DEMO ONLY\nThree samples matched the local enrollment. Minimum cosine %.3f; experimental threshold %.2f. Two random actions completed. No attendance or room claim.",minimumScore,DemoPolicy.MATCH_COSINE); showHome(); return; }
        if(!scanning || !room.fresh(SystemClock.elapsedRealtime())) { faceFailure("Face matched, but no fresh ESP32 signal remains. Restore it and retry."); return; }
        if(purpose.equals("join")) {
            joinPassed=true; classStart=SystemClock.elapsedRealtime(); midAt=20_000+random.nextInt(15_001);
            room.reset(); classPage(); main.removeCallbacks(tick); main.post(tick);
        } else if(purpose.equals("middle") && classStart>=0) {
            middlePassed=true; classPage(); checkButton.setText("Middle check complete"); checkButton.setEnabled(false);
            statusText.setText("Middle face check matched. Keep the app open and ESP32 powered until the timer ends.");
        }
    }
    private void faceFailure(String reason) {
        stopCamera(); clearPendingPin(); brightness(-1);
        if(classStart>=0) {
            classPage(); statusText.setText(reason);
            checkButton.setText("Retry middle face check"); checkButton.setEnabled(true);
        } else { message=reason; showHome(); }
    }
    private void stopCamera() {
        generation++; cameraRunning=false;
        if(provider!=null) provider.unbindAll();
        if(classStart<0) getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
    private void clearPendingPin() { if(pendingPin!=null) { Arrays.fill(pendingPin,'\0'); pendingPin=null; } }
    @Override protected void onResume() { super.onResume(); resumed=true; }
    @Override protected void onPause() {
        super.onPause(); resumed=false;
        if(classStart>=0) finishClass("REVIEW REQUIRED\nDemo interrupted because the app left the foreground. Start a new class demo.");
        else if(cameraRunning) faceFailure("Face check interrupted. Retry in the foreground.");
        stopScan(); clearPendingPin(); brightness(-1);
    }
    @Override protected void onDestroy() { stopCamera(); stopScan(); main.removeCallbacksAndMessages(null); detector.close(); worker.shutdown(); super.onDestroy(); }
}
