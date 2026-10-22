package com.attendance.tracker;

import android.content.Intent;
import com.attendance.prototype.PrototypeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Opens the local demo only. It cannot return enrollment/attendance authority to JS. */
@CapacitorPlugin(name = "AttendanceVerification")
public final class AttendanceVerificationPlugin extends Plugin {
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
