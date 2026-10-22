#!/usr/bin/env python3
"""Host inference smoke check, not a demographic/anti-spoof accuracy evaluation."""
import argparse
import hashlib
import json
from pathlib import Path
import cv2
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--same", required=True, help="Local test face image")
parser.add_argument("--different", required=True, help="Different local test face image")
args = parser.parse_args()
models = Path(__file__).resolve().parents[1] / "client/android/prototype/src/main/assets/models"
detector = cv2.FaceDetectorYN.create(str(models / "face_detection_yunet_2023mar.onnx"), "", (512,512), .9, .3, 5000)
recognizer = cv2.FaceRecognizerSF.create(str(models / "face_recognition_sface_2021dec.onnx"), "")


def embedding(image):
    detector.setInputSize((image.shape[1],image.shape[0]))
    _, faces = detector.detect(image)
    if faces is None or len(faces) != 1:
        raise RuntimeError("Expected exactly one test face")
    aligned = recognizer.alignCrop(image, faces[0])
    result = recognizer.feature(aligned).reshape(-1)
    assert len(result) == 128 and np.isfinite(result).all()
    return result / np.linalg.norm(result)


same = cv2.imread(args.same)
different = cv2.resize(cv2.imread(args.different), None, fx=4, fy=4)
a = embedding(same)
b = embedding(cv2.convertScaleAbs(same, alpha=.9, beta=12))
c = embedding(different)
positive, negative = float(a@b), float(a@c)
assert positive >= .5, "Same-image lighting variant failed experimental threshold"
assert negative < .5, "Different test subject exceeded experimental threshold"
print(json.dumps({"opencv":cv2.__version__,"same_image_lighting_variant_cosine":positive,
    "different_subject_cosine":negative,"experimental_threshold":.5,
    "model_sha256":{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in models.glob("*.onnx")},
    "scope":"Host model/preprocessing smoke check only; no live Android camera, blink or PAD evaluation"},indent=2))
