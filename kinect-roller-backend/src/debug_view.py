"""OpenCV debug visualization: shows the colorized depth image and the
detection mask side by side, with the accepted roller (green) and rejected
candidates (red, with reason) drawn on top.
"""
from __future__ import annotations

import time
from typing import List, Optional, Tuple

import cv2
import numpy as np

from .calibration import colorize_depth
from .config import RollerConfig
from .roller_detector import Candidate, Detection

WINDOW_NAME = "Kinect Roller Debug"


class DebugView:
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

    def render(self, depth: np.ndarray, mask: np.ndarray,
               detection: Optional[Detection], candidates: List[Candidate],
               depth_range_mm: Optional[Tuple[float, float]] = None) -> str:
        """Draws the debug window and returns a command string:
        'quit', 'recalibrate_bg', 'pick_corners', or '' for nothing."""
        self._tick_fps()
        cfg = self.config

        depth_view = colorize_depth(depth, cfg.depth_view_min_mm, cfg.depth_view_max_mm)
        mask_view = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)

        if depth_range_mm is not None:
            # Tint pixels whose OWN depth falls within the calibrated screen
            # range, so you can see at a glance whether that range covers
            # just the screen or spills onto the floor/walls/ceiling too.
            depth_top_mm, depth_bottom_mm = depth_range_mm
            lo, hi = min(depth_top_mm, depth_bottom_mm), max(depth_top_mm, depth_bottom_mm)
            on_screen = (depth >= lo) & (depth <= hi)
            tint = np.zeros_like(depth_view)
            tint[on_screen] = (0, 255, 255)
            depth_view = cv2.addWeighted(depth_view, 1.0, tint, 0.25, 0)

        for cand in candidates:
            color = (0, 220, 0) if cand.accepted else (0, 0, 220)
            box = cand.box_px.astype(np.int32)
            cv2.drawContours(depth_view, [box], 0, color, 2)
            label = (f"x={cand.x_norm:.2f} y={cand.y_norm:.2f} area={cand.area_cm2:.0f}cm2 "
                     f"elong={cand.elongation:.1f} h={cand.top_height_mm:.0f}mm"
                     if cand.accepted else f"reject: {cand.reject_reason}")
            cx, cy = cand.center_px
            cv2.putText(depth_view, label, (int(cx) - 60, int(cy) - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)

        status_lines = [f"FPS: {self._fps:.1f}"]
        if detection is not None:
            state = "TOUCHING" if detection.touching else "hovering"
            state_color = (0, 255, 0) if detection.touching else (0, 200, 255)
            status_lines.append(
                f"{state}  x={detection.x_norm:.3f} y={detection.y_norm:.3f} "
                f"angle={detection.angle_deg:.0f} h={detection.top_height_mm:.0f}mm"
            )
        else:
            state_color = (150, 150, 150)
            status_lines.append("no roller detected")

        combined = np.hstack([depth_view, mask_view])
        for i, line in enumerate(status_lines):
            cv2.putText(combined, line, (10, 25 + i * 24),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65,
                        state_color if i == 1 else (255, 255, 255), 2, cv2.LINE_AA)

        hint = "q: quit   b: recalibrate background   c: calibrate depth range (top/bottom click)   d: dump candidates to console"
        cv2.putText(combined, hint, (10, combined.shape[0] - 12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1, cv2.LINE_AA)

        cv2.imshow(WINDOW_NAME, combined)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q") or key == 27:
            return "quit"
        if key == ord("b"):
            return "recalibrate_bg"
        if key == ord("c"):
            return "pick_corners"
        if key == ord("d"):
            self._dump_candidates(candidates)
        return ""

    def _dump_candidates(self, candidates: List[Candidate]) -> None:
        print(f"--- {len(candidates)} candidate(s) this frame ---")
        for i, c in enumerate(candidates):
            status = "ACCEPTED" if c.accepted else f"rejected ({c.reject_reason})"
            print(f"  [{i}] {status}: x={c.x_norm:.3f} y={c.y_norm:.3f} area={c.area_cm2:.1f}cm2 "
                  f"elongation={c.elongation:.2f} len={c.length_cm:.1f}cm wid={c.width_cm:.1f}cm "
                  f"h={c.top_height_mm:.0f}mm center_px={c.center_px}")

    def close(self) -> None:
        cv2.destroyWindow(WINDOW_NAME)
