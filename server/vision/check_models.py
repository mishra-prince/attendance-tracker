"""Offline inference smoke check on two public/consented test portraits; does not enroll anybody."""
import argparse
import base64
import resource
import sys
import time
import cv2
import numpy as np
from worker import Vision

parser = argparse.ArgumentParser()
parser.add_argument('first_portrait')
parser.add_argument('second_portrait')
args = parser.parse_args()
vision = Vision()
vectors = []
started = time.perf_counter()
for path in [args.first_portrait, args.second_portrait]:
    image = cv2.imread(path)
    if image is None:
        raise SystemExit('Test portrait unavailable')
    h, w = image.shape[:2]
    scale = min(640/w, 640/h)
    image = cv2.resize(image, (int(w*scale), int(h*scale)))
    vector = vision.identity(image)
    repeat = vision.identity(image)
    assert len(vector) == 128 and np.isclose(np.linalg.norm(vector), 1)
    assert np.dot(vector, repeat) > .99
    vectors.append(vector)
assert np.dot(*vectors) < .55, 'Use two different identities for this smoke check'
_, blank = cv2.imencode('.jpg', np.full((480, 640, 3), 127, dtype=np.uint8))
try:
    vision.observe({'atMs': 0, 'jpeg': base64.b64encode(blank).decode()})
    raise AssertionError('Blank image must not pass')
except ValueError as error:
    assert str(error) == 'EXACTLY_ONE_FACE_REQUIRED'
rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024*1024 if sys.platform == 'darwin' else 1024)
print('Real model smoke checks passed; two 128-value templates, same/different identity, no-face rejection.')
print('Elapsed seconds:', round(time.perf_counter()-started, 3), 'peak MiB:', round(rss, 1))
print('This is an inference smoke check, not an accuracy, liveness or capacity evaluation.')
