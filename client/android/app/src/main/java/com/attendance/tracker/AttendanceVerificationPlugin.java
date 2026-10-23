package com.attendance.tracker;

import android.content.Intent;
import android.app.Activity;
import androidx.activity.result.ActivityResult;
import com.attendance.prototype.InstitutionFaceActivity;
import com.attendance.prototype.FaceCaptureBuffer;
import com.getcapacitor.JSObject;
import com.attendance.prototype.PrototypeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import java.util.concurrent.atomic.AtomicBoolean;

/** Captures bounded camera evidence; only the authenticated server can accept it. */
@CapacitorPlugin(name = "AttendanceVerification")
public final class AttendanceVerificationPlugin extends Plugin {
    private final AtomicBoolean capturing = new AtomicBoolean(false);
    @PluginMethod public void captureFace(PluginCall call) {
        try {
            org.json.JSONArray actions = call.getArray("actions");
            if (actions == null || actions.length() != 2) { call.reject("Invalid server camera challenge."); return; }
            String[] sequence = { actions.getString(0), actions.getString(1) };
            if (sequence[0].equals(sequence[1])) { call.reject("Invalid server camera challenge."); return; }
            for (String action : sequence) com.attendance.prototype.FaceChallenge.Action.valueOf(action);
            if (!capturing.compareAndSet(false,true)) { call.reject("Finish the current camera check first."); return; }
            getActivity().runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(getActivity(),InstitutionFaceActivity.class);
                    intent.putExtra("actions",sequence); intent.putExtra("purpose",call.getString("purpose","VERIFY"));
                    startActivityForResult(call,intent,"faceCaptured");
                } catch(Exception e) { capturing.set(false); FaceCaptureBuffer.clear(); call.reject("Could not open the face camera.",e); }
            });
        } catch(Exception e) { call.reject("Invalid server camera challenge.",e); }
    }
    @ActivityCallback private void faceCaptured(PluginCall call,ActivityResult result) {
        capturing.set(false);
        if (call == null) { FaceCaptureBuffer.clear(); return; }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            FaceCaptureBuffer.clear(); call.reject(result.getData() == null ? "Camera check cancelled." : result.getData().getStringExtra("error")); return;
        }
        try {
            String evidence = FaceCaptureBuffer.take(result.getData().getStringExtra("captureToken"));
            if (evidence == null) { call.reject("Camera capture expired. Please start again."); return; }
            call.resolve(new JSObject(evidence));
        } catch(Exception e) { FaceCaptureBuffer.clear(); call.reject("Could not read camera capture. Please retry."); }
    }
    @PluginMethod public void openClassDemo(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(new Intent(getActivity(), PrototypeActivity.class));
                call.resolve();
            } catch (Exception error) {
                call.reject("Could not open classroom demo. Please restart Threshold.", error);
            }
        });
    }
}
