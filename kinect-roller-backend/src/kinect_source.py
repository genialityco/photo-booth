"""Depth (+ optionally color) frame sources.

KinectDepthSource wraps PyKinect2 (Kinect v2, Windows only).
MockDepthSource synthesizes a moving roller so the detector/debug view/
websocket server can be developed and tested without the physical rig.
"""
from __future__ import annotations

import ctypes
import time
from typing import Optional, Tuple

import numpy as np


class DepthSource:
    """Common interface used by main.py."""

    def read(self) -> Optional[np.ndarray]:
        """Return the latest depth frame as a (H, W) float32 array in mm,
        or None if no new frame is available yet."""
        raise NotImplementedError

    def read_color(self) -> Optional[np.ndarray]:
        """Return the latest color frame (H, W, 3) BGR, or None if color
        isn't enabled / no new frame is available yet."""
        return None

    def refresh_color_depth_mapping(self) -> bool:
        """Call once per loop iteration, after read(), before any
        map_color_to_depth() calls this frame. Returns whether a mapping is
        available."""
        return False

    def map_color_to_depth(self, color_x: float, color_y: float) -> Optional[Tuple[int, int, float]]:
        """Given a color-space pixel, return (depth_x, depth_y, depth_mm) at
        that same physical point, or None if it doesn't land on a valid
        depth reading."""
        return None

    def close(self) -> None:
        pass


class KinectDepthSource(DepthSource):
    """Reads depth (and optionally color) frames from a physical Kinect v2
    sensor via PyKinect2."""

    def __init__(self, enable_color: bool = False):
        try:
            from pykinect2 import PyKinectV2
            from pykinect2 import PyKinectRuntime
        except ImportError as exc:  # pragma: no cover - environment dependent
            raise RuntimeError(
                "pykinect2 is not installed or the Kinect for Windows SDK 2.0 "
                "runtime is missing. Install it (see README.md) or run with "
                "--mock to develop without hardware."
            ) from exc

        self._PyKinectV2 = PyKinectV2
        source_types = PyKinectV2.FrameSourceTypes_Depth
        if enable_color:
            source_types |= PyKinectV2.FrameSourceTypes_Color
        self._kinect = PyKinectRuntime.PyKinectRuntime(source_types)
        self.width = self._kinect.depth_frame_desc.Width
        self.height = self._kinect.depth_frame_desc.Height

        self.enable_color = enable_color
        self._color2depth = None
        self._last_depth_2d: Optional[np.ndarray] = None
        if enable_color:
            self.color_width = self._kinect.color_frame_desc.Width
            self.color_height = self._kinect.color_frame_desc.Height
            n_color_px = self.color_width * self.color_height
            color2depth_type = PyKinectV2._DepthSpacePoint * n_color_px
            self._color2depth = ctypes.cast(
                color2depth_type(), ctypes.POINTER(PyKinectV2._DepthSpacePoint)
            )

    def read(self) -> Optional[np.ndarray]:
        if not self._kinect.has_new_depth_frame():
            return None
        frame = self._kinect.get_last_depth_frame()
        # PyKinect2 hands back a flat uint16 buffer, width*height, row-major,
        # already in millimeters.
        depth = frame.reshape((self.height, self.width)).astype(np.float32)
        self._last_depth_2d = depth
        return depth

    def read_color(self) -> Optional[np.ndarray]:
        if not self.enable_color or not self._kinect.has_new_color_frame():
            return None
        frame = self._kinect.get_last_color_frame()
        # PyKinect2 hands back a flat BGRA buffer; drop the alpha channel.
        color = frame.reshape((self.color_height, self.color_width, 4))[:, :, :3]
        return np.ascontiguousarray(color)

    def refresh_color_depth_mapping(self) -> bool:
        if not self.enable_color or self._color2depth is None:
            return False
        # MapColorFrameToDepthSpace fills, for every COLOR pixel, the
        # DepthSpacePoint it corresponds to - it needs the raw depth buffer
        # that get_last_depth_frame() just populated internally.
        color_point_count = ctypes.c_uint(self.color_width * self.color_height)
        self._kinect._mapper.MapColorFrameToDepthSpace(
            self._kinect._depth_frame_data_capacity,
            self._kinect._depth_frame_data,
            color_point_count,
            self._color2depth,
        )
        return True

    def map_color_to_depth(self, color_x: float, color_y: float) -> Optional[Tuple[int, int, float]]:
        if self._color2depth is None or self._last_depth_2d is None:
            return None
        cx, cy = int(color_x), int(color_y)
        if not (0 <= cx < self.color_width and 0 <= cy < self.color_height):
            return None
        pt = self._color2depth[cy * self.color_width + cx]
        dx, dy = pt.x, pt.y
        if dx != dx or dy != dy:  # NaN: no valid depth at this color pixel
            return None
        dxi, dyi = int(round(dx)), int(round(dy))
        if not (0 <= dxi < self.width and 0 <= dyi < self.height):
            return None
        depth_mm = float(self._last_depth_2d[dyi, dxi])
        if depth_mm <= 0:
            return None
        return dxi, dyi, depth_mm

    def close(self) -> None:
        try:
            self._kinect.close()
        except Exception:
            pass


class MockDepthSource(DepthSource):
    """Synthetic depth stream: a flat background plane with a rectangular
    "roller" that drifts around and periodically lifts off / touches down,
    for exercising the detector and websocket pipeline without hardware."""

    def __init__(self, width: int = 512, height: int = 424,
                 background_mm: float = 900.0, roller_diameter_mm: float = 70.0,
                 fps: float = 30.0, use_webcam_for_color: bool = True):
        self.width = width
        self.height = height
        self.background_mm = background_mm
        self.roller_diameter_mm = roller_diameter_mm
        self._fps = fps
        self._t0 = time.time()
        self._last_emit = 0.0
        self._rng = np.random.default_rng(42)
        self._noise_phase = self._rng.uniform(0, 1000, size=3)

        # Optional color source for exercising hand-tracking without a
        # Kinect: falls back to the machine's webcam if one is available.
        # There's no real geometric correspondence to the synthetic depth
        # frame above, so map_color_to_depth() below is a rough proportional
        # scale, not a physically accurate mapping - good enough to test the
        # plumbing, not the real detection quality.
        self.use_webcam_for_color = use_webcam_for_color
        self._webcam = None
        self._webcam_tried = False
        self.color_width = 640
        self.color_height = 480

    def read(self) -> Optional[np.ndarray]:
        now = time.time()
        if now - self._last_emit < 1.0 / self._fps:
            return None
        self._last_emit = now
        t = now - self._t0

        depth = np.full((self.height, self.width), self.background_mm, dtype=np.float32)
        depth += (np.random.default_rng().normal(0, 1.5, depth.shape)).astype(np.float32)

        # Roller center drifts in a lazy loop around the frame.
        cx = self.width * 0.5 + self.width * 0.28 * np.sin(t * 0.35)
        cy = self.height * 0.5 + self.height * 0.28 * np.cos(t * 0.23)
        angle_deg = (t * 12.0) % 180.0

        # Lift cycle: mostly touching, occasionally lifts off and comes back.
        lift_mm = max(0.0, 60.0 * np.sin(t * 0.5) - 40.0)
        top_height_mm = self.roller_diameter_mm + lift_mm

        length_px = (220.0 / 10.0) * (self.width / 520.0) * 4.0  # ~ tuned for 512-wide frame
        width_px = length_px * (7.0 / 22.0)

        rect = ((float(cx), float(cy)), (float(length_px), float(width_px)), float(angle_deg))
        box = _rect_points(rect)

        mask = np.zeros((self.height, self.width), dtype=np.uint8)
        import cv2  # local import: keep module importable without cv2 for pure unit use
        cv2.fillConvexPoly(mask, box.astype(np.int32), 1)

        depth[mask == 1] = self.background_mm - top_height_mm
        depth = np.clip(depth, 1.0, None)
        return depth

    def read_color(self) -> Optional[np.ndarray]:
        if not self.use_webcam_for_color:
            return None
        if not self._webcam_tried:
            self._webcam_tried = True
            import cv2
            cap = cv2.VideoCapture(0)
            if cap.isOpened():
                self._webcam = cap
            else:
                cap.release()
        if self._webcam is None:
            return None
        ok, frame = self._webcam.read()
        if not ok:
            return None
        self.color_height, self.color_width = frame.shape[:2]
        return frame

    def refresh_color_depth_mapping(self) -> bool:
        return self.use_webcam_for_color and self._webcam is not None

    def map_color_to_depth(self, color_x: float, color_y: float) -> Optional[Tuple[int, int, float]]:
        dx = int(color_x / max(1, self.color_width) * self.width)
        dy = int(color_y / max(1, self.color_height) * self.height)
        dx = min(max(dx, 0), self.width - 1)
        dy = min(max(dy, 0), self.height - 1)
        return dx, dy, self.background_mm - 60.0

    def close(self) -> None:
        if self._webcam is not None:
            self._webcam.release()


def _rect_points(rect) -> np.ndarray:
    import cv2
    return cv2.boxPoints(rect)
