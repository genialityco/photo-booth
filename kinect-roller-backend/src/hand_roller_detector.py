"""Roller position/touch from a tracked hand point, instead of from the
roller's own depth silhouette.

Why: matching the roller's shape (22x7cm rectangle) directly in the depth
mask turned out to be unreliable in practice - a hand gripping the roller
occludes/fragments it, and separating "hand" from "hand-holding-roller"
purely from depth geometry proved brittle across several iterations. This
mode instead locates the HAND with MediaPipe on the Kinect's color feed
(a well-proven, robust model) and uses the hand's position as a stand-in
for the roller's position - adequate for driving a reveal-gesture effect,
which doesn't need pixel-perfect roller geometry.

Pipeline (see main.py):
1. HandDetector finds the palm center in the color frame.
2. KinectDepthSource.map_color_to_depth() maps that to a depth-space pixel
   + depth reading (needs the Kinect's coordinate mapper - see
   kinect_source.py).
3. This module turns that into a screen position (direct X, depth-derived Y
   - same convention as the shape-based detector) and a touching/hovering
   read (diff between the hand's depth and the calibrated background depth
   at that point).
"""
from __future__ import annotations

import dataclasses
import time
from typing import Optional, Tuple

from .config import RollerConfig


@dataclasses.dataclass
class HandDetection:
    touching: bool
    x_norm: float
    y_norm: float
    hand_label: str
    depth_mm: float
    diff_mm: float
    timestamp: float = dataclasses.field(default_factory=time.time)

    def to_json(self) -> dict:
        return {
            "type": "roller",
            "touching": self.touching,
            "x": round(self.x_norm, 4),
            "y": round(self.y_norm, 4),
            "hand": self.hand_label,
            "height_mm": round(self.diff_mm, 1),
            "timestamp": self.timestamp,
        }


class HandRollerDetector:
    def __init__(self, config: RollerConfig, background, depth_range_mm: Optional[Tuple[float, float]] = None):
        self.config = config
        self.background = background
        self.depth_range_mm = depth_range_mm

    def set_background(self, background) -> None:
        self.background = background

    def set_depth_range(self, depth_range_mm: Optional[Tuple[float, float]]) -> None:
        self.depth_range_mm = depth_range_mm

    def detect(self, depth_point: Tuple[int, int, float], hand_label: str = "") -> Optional[HandDetection]:
        """depth_point: (depth_x, depth_y, depth_mm) from
        KinectDepthSource.map_color_to_depth() for the tracked hand."""
        cfg = self.config
        dx, dy, depth_mm = depth_point
        if not (0 <= dy < self.background.shape[0] and 0 <= dx < self.background.shape[1]):
            return None

        bg_depth_mm = float(self.background[dy, dx])
        if bg_depth_mm <= 0:
            return None
        diff_mm = bg_depth_mm - depth_mm

        touching = cfg.hand_touch_min_mm <= diff_mm <= cfg.hand_touch_max_mm

        x_norm = dx / cfg.depth_width
        if self.depth_range_mm is None:
            y_norm = dy / cfg.depth_height
        else:
            depth_top_mm, depth_bottom_mm = self.depth_range_mm
            span = depth_bottom_mm - depth_top_mm
            y_norm = (bg_depth_mm - depth_top_mm) / span if span else 0.0

        return HandDetection(
            touching=touching,
            x_norm=x_norm,
            y_norm=y_norm,
            hand_label=hand_label,
            depth_mm=depth_mm,
            diff_mm=diff_mm,
        )
