package com.attendance.calibration;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioDeviceInfo;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.text.InputFilter;
import android.text.InputType;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Standalone offline lab. It neither connects to the attendance API nor awards attendance. */
public final class CalibrationActivity extends Activity {
    private static final int VOID = Color.rgb(10, 9, 8), CARBON = Color.rgb(28, 27, 30);
    private static final int BONE = Color.rgb(245, 241, 238), ASH = Color.rgb(175, 170, 166), RED = Color.rgb(255, 69, 58);
    private static final int PERMISSIONS = 10, EXPORT = 11;
    private static final String[] PROFILES = {"Audible diagnostic · 3 / 4 kHz", "High frequency · 17 / 18 kHz", "Near ultrasonic · 19 / 20 kHz"};
    private static final int[][] FREQUENCIES = {{3000, 4000}, {17000, 18000}, {19000, 20000}};
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final List<View> inputs = new ArrayList<>();
    private SampleStore store;
    private EditText runCode, room, phoneAlias, position;
    private Spinner zone, profile, door, windows, placement, occupancy;
    private CheckBox includeBle;
    private Button measure, cancel, export, clear, problem;
    private TextView status, details, saved;
    private ProgressBar progress;
    private volatile AudioSampler sampler;
    private BluetoothCapture bluetooth;
    private boolean measuring;
    private int seconds;
    private String exportData;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        store = new SampleStore(this);
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(VOID);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(22), dp(18), dp(22), dp(32));
        scroll.addView(content);
        scroll.setOnApplyWindowInsetsListener((v, insets) -> {
            int top, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                top = bars.top; bottom = bars.bottom;
            } else { top = insets.getSystemWindowInsetTop(); bottom = insets.getSystemWindowInsetBottom(); }
            v.setPadding(0, top, 0, bottom);
            return insets;
        });
        setContentView(scroll);
        content.addView(text("THRESHOLD / ROOM LAB", 12, RED));
        TextView title = text("Test the room.", 34, BONE);
        title.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL));
        add(content, title, 10);
        add(content, text("Measure seats and the corridor before trusting automatic attendance.", 16, ASH), 8);
        add(content, text("Offline calibration only. No faces, student accounts or attendance decisions. Raw microphone samples are discarded after analysis.", 13, ASH), 12);

        LinearLayout setup = panel(content, "1  Label this measurement");
        runCode = field(setup, "Study code", "A17C", 4);
        runCode.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        phoneAlias = field(setup, "Anonymous phone label", "P01", 24);
        room = field(setup, "Room label", "R101", 32);
        position = field(setup, "Seat or position", "A1", 32);
        zone = select(setup, "Actual location", new String[]{"Inside", "Corridor", "Doorway", "Adjacent room", "Other outside"});

        LinearLayout signal = panel(content, "2  Match the classroom emitter");
        profile = select(signal, "Sound profile", PROFILES);
        add(signal, text("Use the same study code and profile on the emitter. Start with a quiet audible diagnostic, then compare high-frequency profiles. Some people can hear high-frequency tests.", 13, ASH), 8);
        includeBle = new CheckBox(this);
        includeBle.setText(R.string.include_ble);
        includeBle.setTextColor(BONE); includeBle.setTextSize(14); includeBle.setChecked(true);
        includeBle.setMinHeight(dp(48)); inputs.add(includeBle);
        add(signal, includeBle, 12);

        LinearLayout conditions = panel(content, "3  Record the conditions");
        door = select(conditions, "Door", new String[]{"Closed", "Open", "Ajar", "Unknown"});
        windows = select(conditions, "Windows", new String[]{"Closed", "Open", "Mixed", "Unknown"});
        placement = select(conditions, "Phone placement", new String[]{"In hand", "On desk", "In pocket", "In bag"});
        occupancy = select(conditions, "People in the room", new String[]{"Empty", "1–15", "16–30", "31–60", "Over 60"});

        LinearLayout result = panel(content, "4  Measure for six seconds");
        status = text("Ready when you are.", 24, BONE);
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        add(result, status, 12);
        details = text("Start the speaker, stand at the labelled position, then measure. The microphone and Bluetooth stop when you leave this screen.", 14, ASH);
        add(result, details, 10);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(AudioSampler.SECONDS); progress.setVisibility(View.GONE);
        add(result, progress, 12);
        measure = button(result, "Measure for 6 seconds", true, v -> begin());
        cancel = button(result, "Stop measurement", false, v -> interrupt());
        cancel.setVisibility(View.GONE);
        problem = button(result, "Log a device problem", false, v -> logProblem());

        LinearLayout records = panel(content, "Saved on this phone");
        saved = text("", 14, ASH); add(records, saved, 10);
        export = button(records, "Export measurement summaries", false, v -> export());
        clear = button(records, "Clear saved measurements", false, v -> new AlertDialog.Builder(this)
                .setTitle("Clear measurements?").setMessage("Export first if you need these results. Clearing removes this app's local measurement summaries.")
                .setNegativeButton("Keep", null).setPositiveButton("Clear", (dialog, which) -> {
                    try { store.clear(); refreshSaved(); message("Saved measurements cleared."); } catch (Exception e) { message(e.getMessage()); }
                }).show());
        add(content, text("A received code means this phone decoded the test signal. It does not prove identity, stop relays or verify attendance. A study with two ESPs does not certify iPhone compatibility.", 13, ASH), 20);
        restoreFields();
        if (state != null && state.getBoolean("pendingExport")) {
            try { exportData = exportDocument(); } catch (Exception e) { message("Reopen export to save the summaries."); }
        }
        refreshSaved();
    }

    private JSONObject metadata() throws Exception {
        String code = runCode.getText().toString().trim().toUpperCase(Locale.ROOT);
        if (!code.matches("[0-9A-F]{4}")) throw new IllegalArgumentException("Study code must contain four characters: 0–9 or A–F.");
        for (EditText field : new EditText[]{phoneAlias, room, position}) {
            if (field.getText().toString().trim().isEmpty()) throw new IllegalArgumentException("Add a phone label, room and position before measuring.");
        }
        JSONObject sample = new JSONObject();
        sample.put("sampleId", UUID.randomUUID().toString());
        sample.put("startedAt", timestamp());
        sample.put("studyCode", code);
        sample.put("phoneAlias", phoneAlias.getText().toString().trim());
        sample.put("room", room.getText().toString().trim());
        sample.put("position", position.getText().toString().trim());
        sample.put("zone", zone.getSelectedItem().toString());
        sample.put("profile", profile.getSelectedItemPosition());
        sample.put("lowHz", FREQUENCIES[profile.getSelectedItemPosition()][0]);
        sample.put("highHz", FREQUENCIES[profile.getSelectedItemPosition()][1]);
        sample.put("door", door.getSelectedItem().toString());
        sample.put("windows", windows.getSelectedItem().toString());
        sample.put("placement", placement.getSelectedItem().toString());
        sample.put("occupancy", occupancy.getSelectedItem().toString());
        sample.put("manufacturer", Build.MANUFACTURER);
        sample.put("model", Build.MODEL);
        sample.put("androidApi", Build.VERSION.SDK_INT);
        sample.put("batteryStartPercent", battery());
        sample.put("bluetoothRequested", includeBle.isChecked());
        return sample;
    }

    private void begin() {
        if (measuring) return;
        final JSONObject sample;
        try {
            if (store.read().length() >= SampleStore.LIMIT) { message("Storage is full. Export and clear saved measurements first."); return; }
            sample = metadata();
        } catch (Exception e) { message(e.getMessage()); return; }
        List<String> missing = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) missing.add(Manifest.permission.RECORD_AUDIO);
        if (includeBle.isChecked()) {
            if (Build.VERSION.SDK_INT >= 31) {
                if (checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) missing.add(Manifest.permission.BLUETOOTH_SCAN);
                if (checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) missing.add(Manifest.permission.BLUETOOTH_CONNECT);
            }
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                missing.add(Manifest.permission.ACCESS_COARSE_LOCATION); missing.add(Manifest.permission.ACCESS_FINE_LOCATION);
            }
        }
        if (!missing.isEmpty()) {
            requestPermissions(missing.toArray(new String[0]), PERMISSIONS);
            message("Allow the requested permissions, then tap Measure again. Location permission is for the room's Bluetooth test; GPS coordinates are never read.");
            return;
        }
        InputMethodManager keyboard = (InputMethodManager)getSystemService(Context.INPUT_METHOD_SERVICE);
        if (keyboard != null) keyboard.hideSoftInputFromWindow(runCode.getWindowToken(), 0);
        saveFields();
        measuring = true;
        setBusy(true);
        seconds = 0; progress.setProgress(0);
        status.setText(R.string.listening); details.setText(R.string.capture_instruction);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        final BluetoothCapture ble = new BluetoothCapture();
        bluetooth = ble;
        final AudioSampler audio = new AudioSampler();
        sampler = audio;
        ble.start(this, includeBle.isChecked(), Integer.parseInt(sample.optString("studyCode"), 16));
        handler.postDelayed(tick, 1000);
        handler.postDelayed(timeout, 9500);
        worker.execute(() -> {
            String failure = null;
            try {
                AudioSampler.Capture capture = audio.capture(getApplicationContext(), sample.getInt("lowHz"), sample.getInt("highHz"), Integer.parseInt(sample.getString("studyCode"), 16));
                sample.put("status", "completed");
                sample.put("sampleRate", capture.sampleRate);
                sample.put("audioSource", capture.source);
                sample.put("inputType", capture.inputType);
                sample.put("captureElapsedMs", capture.elapsedMs);
                sample.put("rmsDbfs", capture.signal.rmsDbfs);
                sample.put("clippedFraction", capture.signal.clippedFraction);
                sample.put("meanToneContrast", capture.signal.meanContrast);
                sample.put("tonalWindowFraction", capture.signal.toneFraction);
                sample.put("matchingFrames", capture.signal.matchingFrames);
                sample.put("otherFrames", capture.signal.otherFrames);
                sample.put("expectedCodeReceived", capture.signal.matchingFrames > 0);
                JSONArray frames = new JSONArray();
                for (SignalDecoder.Frame frame : capture.signal.frames) {
                    JSONObject f = new JSONObject();
                    f.put("code", String.format(Locale.ROOT, "%04X", frame.code));
                    f.put("offsetSeconds", frame.seconds); f.put("contrast", frame.contrast); frames.put(f);
                }
                sample.put("frames", frames);
            } catch (CancellationException e) { failure = "Measurement interrupted; no audio retained."; }
            catch (Exception e) { failure = "Could not complete capture: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()); }
            final String problemText = failure;
            try {
                sample.put("bluetooth", ble.stop());
                sample.put("finishedAt", timestamp());
                sample.put("batteryEndPercent", battery());
                if (failure != null) {
                    sample.put("status", failure.startsWith("Measurement interrupted") ? "interrupted" : "error");
                    sample.put("problem", failure);
                }
                store.append(sample);
                runOnUiThread(() -> finish(sample, problemText));
            } catch (Exception e) {
                runOnUiThread(() -> { finish(null, null); message("This attempt could not be saved. " + e.getMessage()); });
            }
        });
    }

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!measuring) return;
            seconds++; progress.setProgress(Math.min(seconds, AudioSampler.SECONDS));
            status.setText(seconds < AudioSampler.SECONDS ? "Listening… " + (AudioSampler.SECONDS - seconds) + "s" : "Analysing the signal…");
            if (seconds < AudioSampler.SECONDS) handler.postDelayed(this, 1000);
        }
    };
    private final Runnable timeout = this::interrupt;

    private void finish(JSONObject sample, String failure) {
        measuring = false; sampler = null; bluetooth = null;
        handler.removeCallbacks(tick); handler.removeCallbacks(timeout);
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setBusy(false);
        if (failure != null) { status.setText(R.string.attempt_problem); details.setText(failure); }
        else if (sample != null) {
            int matching = sample.optInt("matchingFrames");
            status.setText(matching > 0 ? "Expected code received." : sample.optInt("otherFrames") > 0 ? "Different code received." : "Code not received.");
            JSONObject ble = sample.optJSONObject("bluetooth");
            JSONObject inner = ble == null ? null : ble.optJSONObject("inside"), outer = ble == null ? null : ble.optJSONObject("corridor");
            String text = matching + " matching frames · " + sample.optInt("otherFrames") + " other frames\n"
                    + String.format(Locale.ROOT, "Input %.1f dBFS · %.2f%% clipped\n", sample.optDouble("rmsDbfs"), sample.optDouble("clippedFraction") * 100)
                    + "Bluetooth: " + (inner == null ? 0 : inner.optInt("count")) + " inside readings · " + (outer == null ? 0 : outer.optInt("count")) + " corridor readings\n"
                    + "Scan state: " + (ble == null ? "unavailable" : ble.optString("state"));
            if (sample.optInt("inputType") != AudioDeviceInfo.TYPE_BUILTIN_MIC) text += "\nInput was not confirmed as the built-in microphone. Check audio routing before comparing results.";
            if (matching == 0) text += "\nCheck the speaker, study code and profile. A missing code is a test result, not an attendance decision.";
            details.setText(text);
        }
        refreshSaved();
    }

    private void interrupt() {
        AudioSampler audio = sampler;
        if (audio != null) audio.cancel();
        BluetoothCapture ble = bluetooth;
        if (ble != null) ble.stop();
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    @Override protected void onPause() { super.onPause(); saveFields(); interrupt(); }
    @Override protected void onResume() { super.onResume(); if (store != null && saved != null) refreshSaved(); }
    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        // The file picker may recreate this activity. The private store stays authoritative.
        state.putBoolean("pendingExport", exportData != null);
    }
    @Override protected void onDestroy() {
        interrupt(); handler.removeCallbacks(tick); handler.removeCallbacks(timeout); worker.shutdown(); super.onDestroy();
    }

    private void setBusy(boolean value) {
        for (View input : inputs) input.setEnabled(!value);
        measure.setEnabled(!value); export.setEnabled(!value); clear.setEnabled(!value); problem.setEnabled(!value);
        cancel.setVisibility(value ? View.VISIBLE : View.GONE);
        progress.setVisibility(value ? View.VISIBLE : View.GONE);
    }

    private void logProblem() {
        if (measuring) return;
        String[] reasons = {"Microphone permission unavailable", "Microphone unsupported or busy", "Bluetooth unavailable", "Location permission unavailable", "Capture not possible on this phone"};
        new AlertDialog.Builder(this).setTitle("Record a device limitation")
                .setItems(reasons, (dialog, selected) -> {
                    try {
                        JSONObject sample = metadata(); sample.put("status", "device_issue"); sample.put("problem", reasons[selected]);
                        sample.put("finishedAt", timestamp()); store.append(sample); refreshSaved();
                        message("Device limitation saved. Include it when reporting phone compatibility.");
                    } catch (Exception e) { message(e.getMessage()); }
                }).setNegativeButton("Cancel", null).show();
    }

    private void export() {
        try {
            exportData = exportDocument();
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("application/json");
            intent.putExtra(Intent.EXTRA_TITLE, "room-lab-" + runCode.getText().toString().trim() + "-" + System.currentTimeMillis() + ".json");
            startActivityForResult(intent, EXPORT);
        } catch (Exception e) { message("Could not export: " + e.getMessage()); }
    }

    private String exportDocument() throws Exception {
        JSONObject document = new JSONObject();
        document.put("format", "threshold-room-lab-v1"); document.put("appVersion", "0.1.0");
        document.put("exportedAt", timestamp());
        document.put("purpose", "Unvalidated signal calibration. Not identity or attendance evidence.");
        document.put("samples", store.read());
        return document.toString(2);
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != EXPORT) return;
        if (result != RESULT_OK || data == null || data.getData() == null || exportData == null) { exportData = null; return; }
        try (OutputStream stream = getContentResolver().openOutputStream(data.getData(), "w")) {
            if (stream == null) throw new IllegalStateException("The selected location could not be opened.");
            stream.write(exportData.getBytes(StandardCharsets.UTF_8)); message("Measurement summaries exported. No raw audio is included.");
        } catch (Exception e) { message("Export failed: " + e.getMessage()); }
        finally { exportData = null; }
    }

    private int battery() {
        BatteryManager manager = (BatteryManager)getSystemService(Context.BATTERY_SERVICE);
        return manager == null ? -1 : manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
    }

    private static String timestamp() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    private void refreshSaved() {
        try {
            JSONArray all = store.read(); int complete = 0, interrupted = 0, errors = 0, issues = 0;
            for (int i = 0; i < all.length(); i++) {
                switch (all.getJSONObject(i).optString("status")) {
                    case "completed": complete++; break;
                    case "interrupted": interrupted++; break;
                    case "device_issue": issues++; break;
                    default: errors++;
                }
            }
            saved.setText(getString(R.string.saved_count, all.length(), SampleStore.LIMIT, complete, interrupted, errors, issues));
        } catch (Exception e) { saved.setText(R.string.saved_error); }
    }

    private void saveFields() {
        if (runCode == null) return;
        SharedPreferences.Editor edit = getSharedPreferences("lab_settings", MODE_PRIVATE).edit();
        edit.putString("code", runCode.getText().toString()); edit.putString("phone", phoneAlias.getText().toString());
        edit.putString("room", room.getText().toString()); edit.putString("position", position.getText().toString());
        edit.putBoolean("ble", includeBle.isChecked());
        Spinner[] spinners = {zone, profile, door, windows, placement, occupancy};
        for (int i = 0; i < spinners.length; i++) edit.putInt("select_" + i, spinners[i].getSelectedItemPosition());
        edit.apply();
    }

    private void restoreFields() {
        SharedPreferences prefs = getSharedPreferences("lab_settings", MODE_PRIVATE);
        runCode.setText(prefs.getString("code", "A17C")); phoneAlias.setText(prefs.getString("phone", "P01"));
        room.setText(prefs.getString("room", "R101")); position.setText(prefs.getString("position", "A1"));
        includeBle.setChecked(prefs.getBoolean("ble", true));
        Spinner[] spinners = {zone, profile, door, windows, placement, occupancy};
        for (int i = 0; i < spinners.length; i++) spinners[i].setSelection(Math.max(0, Math.min(spinners[i].getCount() - 1, prefs.getInt("select_" + i, 0))));
    }

    private void message(String value) {
        status.setText(R.string.app_name); details.setText(value == null ? "An unexpected problem occurred. Try again." : value);
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(color);
        view.setLineSpacing(dp(2), 1); return view;
    }
    private void add(LinearLayout parent, View view, int top) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.topMargin = dp(top); parent.addView(view, params);
    }
    private LinearLayout panel(LinearLayout parent, String title) {
        LinearLayout view = new LinearLayout(this); view.setOrientation(LinearLayout.VERTICAL); view.setPadding(dp(18), dp(18), dp(18), dp(18));
        GradientDrawable background = new GradientDrawable(); background.setColor(CARBON); background.setCornerRadius(dp(24)); background.setStroke(dp(1), 0x22ffffff); view.setBackground(background);
        add(parent, view, 18); view.addView(text(title, 16, BONE)); return view;
    }
    private EditText field(LinearLayout parent, String label, String initial, int limit) {
        TextView caption = text(label, 13, ASH); add(parent, caption, 14);
        EditText input = new EditText(this); input.setId(View.generateViewId()); caption.setLabelFor(input.getId());
        input.setText(initial); input.setTextColor(BONE); input.setTextSize(16); input.setSingleLine(true); input.setMinHeight(dp(48));
        input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(limit)}); input.setSelectAllOnFocus(true);
        if (Build.VERSION.SDK_INT >= 26) input.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        inputs.add(input); add(parent, input, 2); return input;
    }
    private Spinner select(LinearLayout parent, String label, String[] options) {
        TextView caption = text(label, 13, ASH); add(parent, caption, 14);
        Spinner input = new Spinner(this); input.setId(View.generateViewId()); caption.setLabelFor(input.getId()); input.setMinimumHeight(dp(48));
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, options);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item); input.setAdapter(adapter);
        inputs.add(input); add(parent, input, 2); return input;
    }
    private Button button(LinearLayout parent, String label, boolean primary, View.OnClickListener listener) {
        Button button = new Button(this); button.setText(label); button.setTextColor(BONE); button.setTextSize(14); button.setAllCaps(false);
        button.setMinHeight(dp(52)); button.setPadding(dp(12), dp(12), dp(12), dp(12));
        GradientDrawable background = new GradientDrawable(); background.setColor(primary ? Color.rgb(185, 42, 34) : 0x22ffffff); background.setCornerRadius(dp(26)); button.setBackground(background);
        button.setOnClickListener(listener); add(parent, button, 12); return button;
    }
}
