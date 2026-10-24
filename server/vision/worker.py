"""Private stdin/stdout vision worker. Raw frames stay in memory, never in logs/files."""
import os
os.environ.setdefault('OMP_NUM_THREADS', '1')
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
os.environ.setdefault('MPLCONFIGDIR', '/tmp/threshold-matplotlib')
import base64
import hashlib
import io
import json
import math
from pathlib import Path
import resource
import sys
import cv2
import mediapipe as mp
import numpy as np
from PIL import Image

MODEL = 'sface-2021dec-yunet-2023mar-mp-fl-v1'
HASHES = {
    'face_detection_yunet_2023mar.onnx': '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
    'face_recognition_sface_2021dec.onnx': '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79',
    'face_landmarker.task': '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
}

class Vision:
    def __init__(self):
        directory = Path(os.environ.get('FACE_MODEL_DIR', Path(__file__).parent / 'models'))
        for name, digest in HASHES.items():
            if hashlib.sha256((directory / name).read_bytes()).hexdigest() != digest:
                raise RuntimeError('MODEL_CHECKSUM_MISMATCH')
        cv2.setNumThreads(1)
        self.detector = cv2.FaceDetectorYN.create(str(directory/'face_detection_yunet_2023mar.onnx'), '', (480, 640), .9, .3, 5000)
        self.recognizer = cv2.FaceRecognizerSF.create(str(directory/'face_recognition_sface_2021dec.onnx'), '')
        self.landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(mp.tasks.vision.FaceLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=str(directory/'face_landmarker.task'), delegate=mp.tasks.BaseOptions.Delegate.CPU),
            running_mode=mp.tasks.vision.RunningMode.IMAGE, num_faces=2,
            min_face_detection_confidence=.7, min_face_presence_confidence=.7,
            output_face_blendshapes=True, output_facial_transformation_matrixes=True))
        # Warm all inference paths before health passes. No student data or network is involved.
        blank = np.zeros((480, 640, 3), dtype=np.uint8)
        self.detector.setInputSize((640, 480))
        self.detector.detect(blank)
        warm = self.recognizer.feature(np.zeros((112, 112, 3), dtype=np.uint8)).reshape(-1)
        if warm.shape != (128,) or not np.isfinite(warm).all():
            raise RuntimeError('MODEL_WARMUP_FAILED')
        self.landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=blank))

    def observe(self, item):
        raw = base64.b64decode(item['jpeg'], validate=True)
        if len(raw) < 100 or len(raw) > 180_000:
            raise ValueError('FRAME_SIZE_INVALID')
        # Inspect dimensions before allocating a decoded pixel array.
        with Image.open(io.BytesIO(raw)) as image:
            w, h = image.size
            if image.format != 'JPEG' or not (192 <= w <= 800 and 192 <= h <= 800) or w*h > 640_000:
                raise ValueError('FRAME_DIMENSIONS_INVALID')
            image.verify()
        frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError('FRAME_DECODE_FAILED')
        result = self.landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)))
        if len(result.face_landmarks) != 1:
            raise ValueError('EXACTLY_ONE_FACE_REQUIRED')
        landmarks = result.face_landmarks[0]
        if (max(p.x for p in landmarks)-min(p.x for p in landmarks))*w < 90:
            raise ValueError('FACE_TOO_SMALL')
        scores = {s.category_name: float(s.score) for s in result.face_blendshapes[0]}
        matrix = np.asarray(result.facial_transformation_matrixes[0])
        yaw = math.degrees(math.atan2(matrix[0, 2], matrix[2, 2]))
        pitch = math.degrees(math.atan2(matrix[1, 2], math.hypot(matrix[0, 2], matrix[2, 2])))
        left, right = scores.get('eyeBlinkLeft', 1), scores.get('eyeBlinkRight', 1)
        smile = min(scores.get('mouthSmileLeft', 0), scores.get('mouthSmileRight', 0))
        neutral = abs(yaw) < 15 and abs(pitch) < 15 and left < .35 and right < .35 and smile < .4
        vector = self.identity(frame) if neutral else None
        return {'atMs': item['atMs'], 'yaw': yaw, 'pitch': pitch, 'leftBlink': left, 'rightBlink': right,
                'smile': smile, 'neutral': neutral, 'vector': vector}

    def identity(self, frame):
        h, w = frame.shape[:2]
        self.detector.setInputSize((w, h))
        _, faces = self.detector.detect(frame)
        if faces is None or len(faces) != 1:
            raise ValueError('IDENTITY_FACE_UNREADABLE')
        crop = self.recognizer.alignCrop(frame, faces[0])
        vector = self.recognizer.feature(crop).reshape(-1).astype(float)
        norm = float(np.linalg.norm(vector))
        if vector.shape != (128,) or not np.isfinite(vector).all() or norm < 1e-9:
            raise ValueError('IDENTITY_VECTOR_INVALID')
        return (vector/norm).tolist()

def write(packet):
    print(json.dumps(packet, allow_nan=False, separators=(',', ':')), flush=True)

if __name__ == '__main__':
    try:
        vision = Vision()
        rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        write({'ready': True, 'model': MODEL, 'peakMiB': rss/(1024*1024 if sys.platform == 'darwin' else 1024)})
    except Exception:
        write({'ready': False, 'error': 'VISION_MODEL_UNAVAILABLE'})
        raise SystemExit(1)
    for line in sys.stdin:
        packet = {}
        try:
            if len(line) > 6_000_000:
                raise ValueError('EVIDENCE_TOO_LARGE')
            packet = json.loads(line)
            frames = packet['frames']
            if not isinstance(frames, list) or not 8 <= len(frames) <= 32:
                raise ValueError('FRAME_COUNT_INVALID')
            observations = [vision.observe(frame) for frame in frames]
            write({'id': packet['id'], 'ok': True, 'model': MODEL, 'observations': observations})
        except ValueError as error:
            reason = str(error)
            write({'id': packet.get('id'), 'ok': False, 'error': reason if reason.isupper() and len(reason) < 80 else 'EVIDENCE_UNREADABLE'})
        except Exception:
            write({'id': packet.get('id'), 'ok': False, 'error': 'EVIDENCE_UNREADABLE'})
        finally:
            # The persistent worker must not retain the last student's frames while idle.
            packet.clear()
            frames = observations = []
            line = ''
