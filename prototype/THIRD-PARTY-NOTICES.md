# Prototype dependencies and model provenance

OpenCV Android 4.12.0 is used for local image processing and face inference (Apache-2.0). Its Android Maven distribution is documented by [OpenCV](https://opencv.org/enhanced-opencv-for-android-support-arm-performance-gains/).

The models come from [OpenCV Zoo](https://github.com/opencv/opencv_zoo) at pinned commit `48b10fa505aeb51fbd127fc60a5c660040e823b7`:

| Model | SHA-256 | Distribution license |
| --- | --- | --- |
| `face_detection_yunet_2023mar.onnx` | `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` | MIT, copyright 2020 Shiqi Yu |
| `face_recognition_sface_2021dec.onnx` | `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79` | Apache-2.0 as distributed by OpenCV Zoo |

The model-directory licenses are bundled verbatim in the APK and source at `assets/licenses/`. Repository provenance is recorded in `assets/models/PROVENANCE.json`. See the upstream [YuNet directory](https://github.com/opencv/opencv_zoo/tree/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_detection_yunet), [SFace directory](https://github.com/opencv/opencv_zoo/tree/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_recognition_sface), and [OpenCV face inference tutorial](https://docs.opencv.org/4.x/d9/df8/tutorial_dnn_face.html). An upstream benchmark is not this prototype's live attendance accuracy.

Google ML Kit Face Detection 16.1.7 is the bundled on-device detector, distributed under Google's SDK terms. [Installation and bundled availability](https://developers.google.com/ml-kit/vision/face-detection/android), [ML Kit terms](https://developers.google.com/ml-kit/terms), [eye classification, head orientation and tracking limits](https://developers.google.com/ml-kit/vision/face-detection/face-detection-concepts). The app removes Internet and advertising identifier permissions from its merged manifest. ML Kit is not the identity matcher.

AndroidX CameraX 1.4.2 and Activity 1.11.0 (Apache-2.0) manage the foreground front camera and lifecycle. [CameraX documentation](https://developer.android.com/media/camera/camerax).

Host smoke checks use `lena.jpg` and `messi5.jpg` fetched from official OpenCV test samples on this machine only. Those test photographs and any inferred test embeddings are not included in the submission or repository. The published smoke report contains only comparison scores, model hashes and test scope.
