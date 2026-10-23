# Threshold private face worker

SFace computes a normalized 128-dimensional identity representation. YuNet detects/aligns its face crop. MediaPipe Face Landmarker independently estimates head pose, eye closure and smiles for server-selected action checks. This is **basic active liveness**, not independently evaluated presentation-attack detection (PAD). Replayed/edited video, deepfakes, camera injection and relay remain threats.

`worker.py` communicates only over the parent Node process's private standard input/output. It opens no port. It rejects oversized/non-JPEG frames, large dimensions, no face or multiple faces. Images and vectors are never logged or written to disk. The main API holds encrypted reference templates; the worker does not hold the reference database. One process serves one job at a time; excess work receives a retry response.

Models download during image build with mandatory SHA-256 checks. They are not duplicated in Git. `download_models.py` records exact official sources and hashes. A changed `latest` MediaPipe asset deliberately fails its checksum until reviewed. OpenCV Zoo source revision: `48b10fa505aeb51fbd127fc60a5c660040e823b7`; existing SFace Apache-2.0 and YuNet MIT notices are in `client/android/prototype/src/main/assets/licenses`. See the upstream model documentation for redistribution terms of each asset.

References:

- [OpenCV SFace/YuNet tutorial](https://docs.opencv.org/4.5.5/d0/dd4/tutorial_dnn_face.html)
- [OpenCV Zoo](https://github.com/opencv/opencv_zoo/tree/48b10fa505aeb51fbd127fc60a5c660040e823b7/models)
- [MediaPipe Face Landmarker Python](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/python)
- [Render Docker runtime](https://render.com/docs/docker)

Local development: create a Python 3.12 environment, install `requirements.txt`, download models, then set `FACE_VISION_ENABLED=true` and `FACE_PYTHON` to its absolute Python executable when starting the API from `server/`. Do not use the Python worker as a public HTTP service. Keep the stable encryption root backed up privately; changing it makes existing templates unreadable and requires supervised recovery.

No model accuracy, spoof resistance, phone compatibility, fairness or 60-student capacity claim follows from a successful build. Measure those on consenting volunteers and the target hosting plan before requiring face checks for credit.
