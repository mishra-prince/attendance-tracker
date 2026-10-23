package com.attendance.tracker;

import android.app.Activity;
import android.content.Intent;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import java.io.OutputStream;
import java.util.concurrent.atomic.AtomicBoolean;

/** User-chosen document export; no broad storage permission or shared automatic file writes. */
@CapacitorPlugin(name = "AttendanceFiles")
public final class AttendanceFilesPlugin extends Plugin {
    private final AtomicBoolean choosing = new AtomicBoolean(false);
    @PluginMethod public void saveFile(PluginCall call) {
        String name=call.getString("fileName"), mime=call.getString("mimeType"), data=call.getString("base64");
        if(name==null || !name.matches("[A-Za-z0-9._-]{1,100}") || data==null || data.length()>5_600_000
            || !("text/csv".equals(mime) || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".equals(mime))) {
            call.reject("Unsupported file name, type or size."); return;
        }
        if(!choosing.compareAndSet(false,true)) { call.reject("Finish the current file save first."); return; }
        getActivity().runOnUiThread(() -> {
            try {
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mime); intent.putExtra(Intent.EXTRA_TITLE,name); startActivityForResult(call,intent,"fileChosen");
            } catch(Exception error) { choosing.set(false); call.reject("Could not open the file chooser.",error); }
        });
    }
    @ActivityCallback private void fileChosen(PluginCall call,ActivityResult result) {
        choosing.set(false);
        if(call==null)return;
        if(result.getResultCode()!=Activity.RESULT_OK || result.getData()==null || result.getData().getData()==null) { call.reject("File save cancelled."); return; }
        try {
            byte[] bytes=Base64.decode(call.getString("base64",""),Base64.DEFAULT);
            try(OutputStream stream=getContext().getContentResolver().openOutputStream(result.getData().getData(),"w")) {
                if(stream==null)throw new java.io.IOException("Selected destination unavailable"); stream.write(bytes);
            } finally { java.util.Arrays.fill(bytes,(byte)0); }
            call.resolve();
        } catch(Exception error) { call.reject("Could not save to the selected destination.",error); }
    }
}
