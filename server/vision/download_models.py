"""Build-time download of public models; every byte is pinned by SHA-256."""
import hashlib
from pathlib import Path
import urllib.request

ROOT = Path(__file__).parent / 'models'
SOURCES = {
    'face_detection_yunet_2023mar.onnx': ('https://media.githubusercontent.com/media/opencv/opencv_zoo/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_detection_yunet/face_detection_yunet_2023mar.onnx', '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4'),
    'face_recognition_sface_2021dec.onnx': ('https://media.githubusercontent.com/media/opencv/opencv_zoo/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_recognition_sface/face_recognition_sface_2021dec.onnx', '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79'),
    'face_landmarker.task': ('https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task', '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff'),
}
ROOT.mkdir(exist_ok=True)
for name, (url, expected) in SOURCES.items():
    destination = ROOT / name
    if destination.exists() and hashlib.sha256(destination.read_bytes()).hexdigest() == expected:
        continue
    with urllib.request.urlopen(url, timeout=120) as response:
        data = response.read(50_000_000)
    if hashlib.sha256(data).hexdigest() != expected:
        raise RuntimeError('Public model checksum mismatch: ' + name)
    destination.write_bytes(data)
    print('Verified public model:', name)
