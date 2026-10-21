package com.attendance.tracker;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.*;
import android.content.Context;
import android.location.LocationManager;
import android.os.Build;
import android.os.ParcelUuid;
import android.view.WindowManager;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Foreground-only classroom discovery. Never reads or sends MAC addresses. */
@CapacitorPlugin(name = "AttendanceBluetooth", permissions = {
    @Permission(alias = "scan", strings = {Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT}),
    @Permission(alias = "advertise", strings = {Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT}),
    @Permission(alias = "location", strings = {Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION})
})
public class AttendanceBluetoothPlugin extends Plugin {
    private static final ParcelUuid SERVICE = ParcelUuid.fromString("c90d7b00-9364-4fbc-8c5a-f79f438f1ca1");
    private BluetoothLeScanner scanner;
    private BluetoothLeAdvertiser advertiser;
    private ScanCallback scanCallback;
    private AdvertiseCallback advertiseCallback;
    private final Map<String, Long> lastSeen = new ConcurrentHashMap<>();

    private BluetoothAdapter adapter() {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return manager == null ? null : manager.getAdapter();
    }

    @PluginMethod public void getStatus(PluginCall call) {
        BluetoothAdapter adapter = adapter();
        JSObject result = new JSObject();
        result.put("supported", adapter != null);
        boolean permission = Build.VERSION.SDK_INT < 31 || getPermissionState("scan") == PermissionState.GRANTED;
        result.put("enabled", adapter != null && permission && adapter.isEnabled());
        result.put("canAdvertise", adapter != null && permission && adapter.isMultipleAdvertisementSupported());
        call.resolve(result);
    }

    @PluginMethod public void startScan(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31 && getPermissionState("scan") != PermissionState.GRANTED) {
            requestPermissionForAlias("scan", call, "scanPermission"); return;
        }
        // Classroom presence is a location use: do not assert neverForLocation.
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "scanPermission"); return;
        }
        try {
            BluetoothAdapter adapter = adapter();
            if (adapter == null || !adapter.isEnabled()) { call.reject("Turn on Bluetooth, then try again."); return; }
            LocationManager location = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
            if (Build.VERSION.SDK_INT < 31 && location != null &&
                !location.isProviderEnabled(LocationManager.GPS_PROVIDER) && !location.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                call.reject("Turn on Location services to allow Bluetooth scanning on this Android version."); return;
            }
            stopScanning();
            scanner = adapter.getBluetoothLeScanner();
            if (scanner == null) { call.reject("Bluetooth scanning is unavailable. Ask your teacher for assisted attendance."); return; }
            scanCallback = new ScanCallback() {
                @Override public void onScanResult(int type, ScanResult result) {
                    if (result.getScanRecord() == null) return;
                    byte[] bytes = result.getScanRecord().getServiceData(SERVICE);
                    if (bytes == null || bytes.length != 8) return;
                    StringBuilder hex = new StringBuilder();
                    for (byte b : bytes) hex.append(String.format("%02X", b & 0xff));
                    String beacon = hex.toString();
                    long now = android.os.SystemClock.elapsedRealtime();
                    if (now - lastSeen.getOrDefault(beacon, 0L) < 10000) return;
                    if (lastSeen.size() > 32) lastSeen.clear();
                    lastSeen.put(beacon, now);
                    JSObject event = new JSObject();
                    event.put("beaconId", beacon); event.put("rssi", result.getRssi());
                    notifyListeners("beacon", event);
                }
                @Override public void onScanFailed(int error) {
                    stopScanning();
                    notifyListeners("stopped", new JSObject().put("message", "Bluetooth scan stopped (" + error + "). Tap Start to retry."));
                }
            };
            ScanFilter filter = new ScanFilter.Builder().setServiceData(SERVICE, new byte[0]).build();
            scanner.startScan(Collections.singletonList(filter), new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_BALANCED).build(), scanCallback);
            keepAwake(true);
            call.resolve();
        } catch (SecurityException e) { stopScanning(); call.reject("Bluetooth permission was removed. Allow it in app settings.", e); }
        catch (Exception e) { stopScanning(); call.reject("Bluetooth scanning could not start. Check Bluetooth and app permissions.", e); }
    }

    @PermissionCallback private void scanPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31 && getPermissionState("scan") != PermissionState.GRANTED) {
            call.reject("Allow Nearby devices in app settings to check classroom presence."); return;
        }
        if (getPermissionState("location") != PermissionState.GRANTED) {
            if (Build.VERSION.SDK_INT >= 31 && getPermissionState("location") == PermissionState.PROMPT) {
                requestPermissionForAlias("location", call, "scanLocationPermission"); return;
            }
            call.reject("Allow precise Location in app settings to check classroom presence."); return;
        }
        startScan(call);
    }

    @PermissionCallback private void scanLocationPermission(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Allow precise Location in app settings to check classroom presence."); return;
        }
        startScan(call);
    }

    @PluginMethod public void advertise(PluginCall call) {
        String beacon = call.getString("beaconId", "");
        if (!beacon.matches("[A-F0-9]{16}")) { call.reject("Invalid classroom signal."); return; }
        if (Build.VERSION.SDK_INT >= 31 && getPermissionState("advertise") != PermissionState.GRANTED) {
            requestPermissionForAlias("advertise", call, "advertisePermission"); return;
        }
        try {
            BluetoothAdapter adapter = adapter();
            if (adapter == null || !adapter.isEnabled()) { call.reject("Turn on Bluetooth, then try again."); return; }
            if (!adapter.isMultipleAdvertisementSupported()) { call.reject("This phone cannot broadcast a class signal. Use another teacher phone or assisted attendance."); return; }
            stopAdvertising();
            advertiser = adapter.getBluetoothLeAdvertiser();
            if (advertiser == null) { call.reject("Bluetooth broadcasting is unavailable."); return; }
            byte[] bytes = new byte[8];
            for (int i = 0; i < 8; i++) bytes[i] = (byte) Integer.parseInt(beacon.substring(i * 2, i * 2 + 2), 16);
            advertiseCallback = new AdvertiseCallback() {
                @Override public void onStartSuccess(AdvertiseSettings settings) { keepAwake(true); call.resolve(); }
                @Override public void onStartFailure(int error) { stopAdvertising(); call.reject("Could not broadcast class signal (" + error + "). Try again."); }
            };
            // 29 bytes including flags: fits legacy BLE advertising on older phones.
            AdvertiseData data = new AdvertiseData.Builder().addServiceData(SERVICE, bytes).setIncludeDeviceName(false).build();
            AdvertiseSettings settings = new AdvertiseSettings.Builder().setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_LOW).setConnectable(false).setTimeout(35000).build();
            advertiser.startAdvertising(settings, data, advertiseCallback);
        } catch (Exception e) { stopAdvertising(); call.reject("Bluetooth broadcast could not start. Check permissions.", e); }
    }

    @PermissionCallback private void advertisePermission(PluginCall call) {
        if (getPermissionState("advertise") != PermissionState.GRANTED) { call.reject("Allow Nearby devices in app settings to broadcast."); return; }
        advertise(call);
    }

    @PluginMethod public void stop(PluginCall call) { stopScanning(); stopAdvertising(); call.resolve(); }

    private void keepAwake(boolean enabled) {
        getActivity().runOnUiThread(() -> {
            if (enabled) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }
    private void stopScanning() {
        try { if (scanner != null && scanCallback != null) scanner.stopScan(scanCallback); }
        catch (SecurityException ignored) {} catch (Exception ignored) {}
        scanner = null; scanCallback = null; lastSeen.clear(); keepAwake(false);
    }
    private void stopAdvertising() {
        try { if (advertiser != null && advertiseCallback != null) advertiser.stopAdvertising(advertiseCallback); }
        catch (SecurityException ignored) {} catch (Exception ignored) {}
        advertiser = null; advertiseCallback = null; keepAwake(false);
    }
    @Override protected void handleOnPause() {
        boolean wasActive = scanCallback != null || advertiseCallback != null;
        stopScanning(); stopAdvertising();
        if (wasActive) notifyListeners("stopped", new JSObject().put("message", "Bluetooth paused while the app was away. Tap Start to resume."));
    }
    @Override protected void handleOnDestroy() { stopScanning(); stopAdvertising(); }
}
