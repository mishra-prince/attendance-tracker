package com.attendance.calibration;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanRecord;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.bluetooth.le.BluetoothLeScanner;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.os.Build;
import android.os.ParcelUuid;
import android.os.SystemClock;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Lab beacon observations only. No device address, name, or scan payload is retained. */
public final class BluetoothCapture {
    public static final ParcelUuid SERVICE = ParcelUuid.fromString("a2f2a5d0-558e-4c89-993a-d93215ef98f1");
    private final List<Integer> inside = new ArrayList<>();
    private final List<Integer> corridor = new ArrayList<>();
    private BluetoothLeScanner scanner;
    private ScanCallback callback;
    private String state = "not_requested";
    private long started;
    private JSONObject snapshot;

    public synchronized void start(Context context, boolean requested, int expectedCode) {
        if (!requested) return;
        if (Build.VERSION.SDK_INT >= 31 && (context.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED
                || context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED)) {
            state = "permission_denied"; return;
        }
        if (context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            state = "location_permission_denied"; return;
        }
        try {
            BluetoothManager manager = (BluetoothManager)context.getSystemService(Context.BLUETOOTH_SERVICE);
            BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
            if (adapter == null) { state = "unsupported"; return; }
            if (!adapter.isEnabled()) { state = "bluetooth_off"; return; }
            if (Build.VERSION.SDK_INT < 31) {
                LocationManager location = (LocationManager)context.getSystemService(Context.LOCATION_SERVICE);
                if (location != null && !location.isProviderEnabled(LocationManager.GPS_PROVIDER)
                        && !location.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    state = "location_services_off"; return;
                }
            }
            scanner = adapter.getBluetoothLeScanner();
            if (scanner == null) { state = "unavailable"; return; }
            started = SystemClock.elapsedRealtime();
            callback = new ScanCallback() {
                @Override public void onScanResult(int type, ScanResult result) {
                    ScanRecord record = result.getScanRecord();
                    byte[] data = record == null ? null : record.getManufacturerSpecificData(0xffff);
                    if (data == null || data.length != 4 || data[0] != 1) return;
                    int code = ((data[2] & 255) << 8) | (data[3] & 255);
                    if (code != expectedCode || result.getRssi() < -127 || result.getRssi() > 20) return;
                    synchronized (BluetoothCapture.this) {
                        if (!"scanning".equals(state)) return;
                        List<Integer> target = data[1] == 1 ? inside : data[1] == 2 ? corridor : null;
                        if (target != null && target.size() < 2000) target.add(result.getRssi());
                    }
                }
                @Override public void onScanFailed(int error) {
                    synchronized (BluetoothCapture.this) { state = "scan_failed_" + error; }
                }
            };
            state = "scanning";
            scanner.startScan(Collections.singletonList(new ScanFilter.Builder().setServiceUuid(SERVICE).build()),
                    new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).setReportDelay(0).build(), callback);
        } catch (SecurityException e) { state = "permission_denied"; }
        catch (RuntimeException e) { state = "scan_unavailable"; }
    }

    public synchronized JSONObject stop() {
        if (snapshot != null) return snapshot;
        if (scanner != null && callback != null) {
            try { scanner.stopScan(callback); }
            catch (SecurityException revoked) { state = "permission_revoked"; }
            catch (RuntimeException unavailable) { state = "stop_unavailable"; }
        }
        scanner = null; callback = null;
        JSONObject result = new JSONObject();
        try {
            result.put("state", "scanning".equals(state) ? "completed" : state);
            result.put("elapsedMs", started == 0 ? 0 : SystemClock.elapsedRealtime() - started);
            result.put("inside", summarize(inside));
            result.put("corridor", summarize(corridor));
        } catch (JSONException e) { throw new IllegalStateException(e); }
        state = "stopped";
        snapshot = result;
        return result;
    }

    private static JSONObject summarize(List<Integer> samples) throws JSONException {
        JSONObject result = new JSONObject();
        List<Integer> sorted = new ArrayList<>(samples);
        Collections.sort(sorted);
        result.put("count", samples.size());
        result.put("rssiDbm", new JSONArray(samples));
        if (!sorted.isEmpty()) {
            int n = sorted.size();
            double median = n % 2 == 0 ? (sorted.get(n / 2 - 1) + sorted.get(n / 2)) / 2.0 : sorted.get(n / 2);
            result.put("medianDbm", median);
            result.put("minimumDbm", sorted.get(0));
            result.put("maximumDbm", sorted.get(n - 1));
        }
        return result;
    }
}
