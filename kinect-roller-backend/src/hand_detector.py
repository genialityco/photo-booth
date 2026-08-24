"""Wraps MediaPipe Hands to locate the hand gripping the roller in a color
frame. Runs on the Kinect's color stream (MediaPipe's model is trained on
real photos, not depth data), coordinates are handed back in color-space
pixels - the caller maps them into depth space to read touch distance and
screen position.
"""
from __future__ import annotations

import dataclasses
from typing import List

import cv2
import numpy as np

try:
    import mediapipe as mp
except ImportError:  # pragma: no cover - environment dependent
    mp = None


@dataclasses.dataclass
class HandPoint:
    x_px: float  # color-space pixel x
    y_px: float  # color-space pixel y
    label: str   # 'Left' or 'Right' (as MediaPipe sees it - mirrored if the feed is)


# Palm-base landmarks (wrist + the 4 knuckle/MCP joints). Averaging these
# gives a "hand center" that sits close to where a gripped roller actually
# is and doesn't jitter with finger movement the way a fingertip does.
_PALM_LANDMARK_IDS = [0, 5, 9, 13, 17]


class HandDetector:
    def __init__(self, max_num_hands: int = 1,
                 min_detection_confidence: float = 0.6,
                 min_tracking_confidence: float = 0.6):
        if mp is None:
            raise RuntimeError(
                "mediapipe is not installed. Run: pip install mediapipe==0.10.21 "
                "(see README.md - newer mediapipe dropped the API this uses)."
            )
        self._hands = mp.solutions.hands.Hands(
            static_image_mode=False,
            max_num_hands=max_num_hands,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )

    def detect(self, color_bgr: np.ndarray) -> List[HandPoint]:
        rgb = cv2.cvtColor(color_bgr, cv2.COLOR_BGR2RGB)
        results = self._hands.process(rgb)
        points: List[HandPoint] = []
        if not results.multi_hand_landmarks:
            return points

        h, w = color_bgr.shape[:2]
        handedness = results.multi_handedness or []
        for i, hand_landmarks in enumerate(results.multi_hand_landmarks):
            xs = [hand_landmarks.landmark[j].x for j in _PALM_LANDMARK_IDS]
            ys = [hand_landmarks.landmark[j].y for j in _PALM_LANDMARK_IDS]
            cx = (sum(xs) / len(xs)) * w
            cy = (sum(ys) / len(ys)) * h
            label = handedness[i].classification[0].label if i < len(handedness) else "Unknown"
            points.append(HandPoint(x_px=float(cx), y_px=float(cy), label=label))
        return points

    def close(self) -> None:
        self._hands.close()
