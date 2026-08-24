"""OpenCV debug visualization for hand-tracking mode: shows the color feed
with the tracked hand point and touch status overlaid, next to the
colorized depth view for reference.
"""
from __future__ import annotations

import time
from typing import List, Optional

import cv2
import numpy as np

from .calibration import colorize_depth
from .config import RollerConfig
from .hand_detector import HandPoint
from .hand_roller_detector import HandDetection

WINDOW_NAME = "Kinect Roller Debug (hand tracking)"


class HandDebugView:
    def __init__(self, config: RollerConfig):
        self.config = config
        self._last_time = time.time()
        self._fps = 0.0
        cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_NORMAL)

    def _tick_fps(self) -> None:
        now = time.time()
        dt = now - self._last_time
        self._last_time = now
        if dt > 0:
            inst_fps = 1.0 / dt
            self._fps = self._fps * 0.9 + inst_fps * 0.1 if self._fps else inst_fps

    def render(self, depth: Optional[np.ndarray], color: Optional[np.ndarray],
               hand_points: List[HandPoint], detection: Optional[HandDetection]) -> str:
        """Draws the debug window and returns a command string:
        'quit', 'recalibrate_bg', 'pick_corners', or '' for nothing."""
        self._tick_fps()
        cfg = self.config

        if color is not None:
            view = color.copy()
        else:
            view = np.zeros((cfg.depth_height, cfg.depth_width, 3), dtype=np.uint8)

        for hp in hand_points:
            color_dot = (0, 255, 0) if detection is not None and detection.touching else (0, 200, 255)
            cv2.circle(view, (int(hp.x_px), int(hp.y_px)), 12, color_dot, -1)
            cv2.putText(view, hp.label, (int(hp.x_px) + 14, int(hp.y_px)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color_dot, 2, cv2.LINE_AA)

        status_lines = [f"FPS: {self._fps:.1f}"]
        if detection is not None:
            state = "TOUCHING" if detection.touching else "hovering"
            state_color = (0, 255, 0) if detection.touching else (0, 200, 255)
            status_lines.append(
                f"{state}  x={detection.x_norm:.3f} y={detection.y_norm:.3f} "
                f"diff={detection.diff_mm:.0f}mm hand={detection.hand_label}"
            )
        elif hand_points:
            state_color = (150, 150, 150)
            status_lines.append("hand seen, but not mapped to a valid depth point")
        else:
            state_color = (150, 150, 150)
            status_lines.append("no hand detected")

        for i, line in enumerate(status_lines):
            cv2.putText(view, line, (10, 25 + i * 24),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65,
                        state_color if i == 1 else (255, 255, 255), 2, cv2.LINE_AA)

        if depth is not None:
            depth_view = colorize_depth(depth, cfg.depth_view_min_mm, cfg.depth_view_max_mm)
            depth_view = cv2.resize(depth_view, (view.shape[1] // 3, view.shape[0] // 3))
            vh, vw = depth_view.shape[:2]
            view[10:10 + vh, view.shape[1] - vw - 10:view.shape[1] - 10] = depth_view

        hint = "q: quit   b: recalibrate background   c: calibrate depth range (top/bottom click)"
        cv2.putText(view, hint, (10, view.shape[0] - 12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1, cv2.LINE_AA)

        cv2.imshow(WINDOW_NAME, view)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q") or key == 27:
            return "quit"
        if key == ord("b"):
            return "recalibrate_bg"
        if key == ord("c"):
            return "pick_corners"
        return ""

    def close(self) -> None:
        cv2.destroyWindow(WINDOW_NAME)
