package com.attendance.prototype;

import android.content.Context;
import android.graphics.Bitmap;
import org.opencv.android.OpenCVLoader;
import org.opencv.android.Utils;
import org.opencv.core.*;
import org.opencv.imgproc.Imgproc;
import org.opencv.objdetect.FaceDetectorYN;
import org.opencv.objdetect.FaceRecognizerSF;
import java.io.*;

public final class FaceEngine {
    private final FaceDetectorYN detector;
    private final FaceRecognizerSF recognizer;
    public FaceEngine(Context context) throws IOException {
        if (!OpenCVLoader.initLocal()) throw new IOException("OpenCV could not start on this phone");
        Core.setNumThreads(2);
        detector = FaceDetectorYN.create(model(context, "face_detection_yunet_2023mar.onnx"), "", new Size(480,640), .9f, .3f, 5000);
        recognizer = FaceRecognizerSF.create(model(context, "face_recognition_sface_2021dec.onnx"), "");
    }
    private String model(Context context, String name) throws IOException {
        File out = new File(context.getNoBackupFilesDir(), name);
        // Atomic copy: an interrupted first launch cannot leave a partial model for next launch.
        if (!out.exists()) {
            File temp = new File(context.getNoBackupFilesDir(), name + ".tmp");
            try (InputStream in = context.getAssets().open("models/" + name); FileOutputStream stream = new FileOutputStream(temp)) {
                byte[] buffer = new byte[65536]; int n;
                while ((n = in.read(buffer)) != -1) stream.write(buffer, 0, n);
                stream.getFD().sync();
            }
            if (!temp.renameTo(out)) throw new IOException("Could not prepare offline model");
        }
        return out.getAbsolutePath();
    }
    public synchronized float[] embedding(Bitmap bitmap) {
        Mat rgba = new Mat(), bgr = new Mat(), faces = new Mat(), aligned = new Mat(), feature = new Mat();
        Mat row = null;
        try {
            Utils.bitmapToMat(bitmap, rgba);
            Imgproc.cvtColor(rgba, bgr, Imgproc.COLOR_RGBA2BGR);
            detector.setInputSize(bgr.size()); detector.detect(bgr, faces);
            if (faces.rows() != 1) throw new IllegalArgumentException("Show exactly one face in good light");
            if (faces.get(0, 2)[0] < 100 || faces.get(0, 3)[0] < 100) throw new IllegalArgumentException("Move a little closer to the camera");
            row = faces.row(0);
            recognizer.alignCrop(bgr, row, aligned); recognizer.feature(aligned, feature);
            float[] vector = new float[128];
            if (feature.total() != 128) throw new IllegalArgumentException("Unexpected face model output");
            feature.get(0, 0, vector);
            return FaceMath.normalized(vector);
        } finally {
            if (row != null) row.release();
            rgba.release(); bgr.release(); faces.release(); aligned.release(); feature.release();
        }
    }
}
