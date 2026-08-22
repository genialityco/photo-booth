"""Calibration routines:

1. capture_background()  - average N depth frames of the empty screen.
2. pick_depth_range()     - interactive click of the top and bottom edges of
                             the screen in the depth view. The Kinect looks
                             down along the face of the screen from above
                             (not straight-on), so screen-Y is encoded in
                             DEPTH rather than image row - these two clicks
                             just read the background depth at those points.
                             Screen-X needs no calibration: it maps directly
                             to the image column.
"""
from __future__ import annotations

import time
from typing import List, Optional, Tuple

import cv2
import numpy as np

from . import config as cfgmod
from .kinect_source import DepthSource


def capture_background(source: DepthSource, config: cfgmod.RollerConfig,
                        path: str = cfgmod.DEFAULT_BACKGROUND_PATH) -> np.ndarray:
    """Average several depth frames of the empty screen and persist to disk."""
    frames: List[np.ndarray] = []
    print(f"[calibration] Capturing {config.background_capture_frames} background frames. "
          f"Keep the screen empty...")
    while len(frames) < config.background_capture_frames:
        frame = source.read()
        if frame is None:
            time.sleep(0.01)
            continue
        frames.append(frame)

    stacked = np.stack(frames, axis=0)
    # Ignore zero/invalid pixels when averaging.
    valid = stacked > 0
    counts = valid.sum(axis=0)
    counts[counts == 0] = 1
    background = (stacked * valid).sum(axis=0) / counts
    background = background.astype(np.float32)

    np.save(path, background)
    print(f"[calibration] Background saved to {path}")
    return background


def colorize_depth(depth: np.ndarray, min_mm: float, max_mm: float) -> np.ndarray:
    clipped = np.clip(depth, min_mm, max_mm)
    norm = ((clipped - min_mm) / max(1.0, (max_mm - min_mm)) * 255).astype(np.uint8)
    norm[depth <= 0] = 0
    return cv2.applyColorMap(norm, cv2.COLORMAP_JET)


def _patch_depth_mm(background: np.ndarray, x: int, y: int, radius: int = 4) -> Optional[float]:
    """Median background depth in a small patch around (x, y), ignoring
    invalid (zero) pixels. More robust than a single pixel, which can land
    exactly on a sensor dropout - returns None if the whole patch is invalid,
    so the caller can reject the click instead of silently recording a
    bogus 0mm reading (this previously caused
    depth_top_mm/depth_bottom_mm == 0.0, which broke the screen-plane fit
    later with no clear error at click time)."""
    h, w = background.shape
    x0, x1 = max(0, x - radius), min(w, x + radius + 1)
    y0, y1 = max(0, y - radius), min(h, y + radius + 1)
    patch = background[y0:y1, x0:x1]
    valid = patch[patch > 0]
    if valid.size == 0:
        return None
    return float(np.median(valid))


def pick_depth_range(
    source: DepthSource, config: cfgmod.RollerConfig, background: np.ndarray
) -> Optional[Tuple[float, float]]:
    """Show a live depth preview; user left-clicks two points on the empty
    screen: first the TOP edge (closest to the Kinect), then the BOTTOM edge
    (farthest). Reads the calibrated background depth at those two pixel
    locations (median of a small patch, not a single pixel - see
    _patch_depth_mm). Returns (depth_top_mm, depth_bottom_mm), or None if
    the user cancelled with 'q'/Esc before finishing."""
    clicked: List[Tuple[int, int]] = []
    rejected_msg = [""]
    window = "Click TOP of screen, then BOTTOM of screen - 'r' to reset, 'q' to cancel"
    cv2.namedWindow(window)

    def on_mouse(event, x, y, flags, userdata):
        if event != cv2.EVENT_LBUTTONDOWN or len(clicked) >= 2:
            return
        if _patch_depth_mm(background, x, y) is None:
            rejected_msg[0] = f"No valid depth near ({x},{y}) - click a different spot"
            print(f"[calibration] {rejected_msg[0]}")
            return
        rejected_msg[0] = ""
        clicked.append((x, y))

    cv2.setMouseCallback(window, on_mouse)

    result = None
    last_frame: Optional[np.ndarray] = None
    labels = ["TOP", "BOTTOM"]
    try:
        while True:
            frame = source.read()
            if frame is not None:
                last_frame = frame
            if last_frame is None:
                cv2.waitKey(1)
                continue

            preview = colorize_depth(last_frame, config.depth_view_min_mm, config.depth_view_max_mm)
            for i, pt in enumerate(clicked):
                cv2.circle(preview, pt, 6, (0, 255, 0), -1)
                cv2.putText(preview, labels[i], (pt[0] + 8, pt[1] - 8),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            if rejected_msg[0]:
                cv2.putText(preview, rejected_msg[0], (10, preview.shape[0] - 12),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1, cv2.LINE_AA)

            cv2.imshow(window, preview)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            if key == ord("r"):
                clicked.clear()
                rejected_msg[0] = ""
            if len(clicked) == 2:
                (x0, y0), (x1, y1) = clicked
                depth_top_mm = _patch_depth_mm(background, x0, y0)
                depth_bottom_mm = _patch_depth_mm(background, x1, y1)
                print(f"[calibration] top={depth_top_mm:.0f}mm bottom={depth_bottom_mm:.0f}mm - "
                      f"press 'y' to accept or 'r' to redo")
                key2 = cv2.waitKey(0) & 0xFF
                if key2 == ord("y"):
                    result = (depth_top_mm, depth_bottom_mm)
                    break
                clicked.clear()
    finally:
        cv2.destroyWindow(window)

    return result


def derive_depth_range(background: np.ndarray, low_pct: float = 1.0,
                        high_pct: float = 99.0) -> Tuple[float, float]:
    """Fallback when you'd rather not click: derive the screen's depth range
    straight from the background capture (assumes the Kinect's view is
    dominated by the screen, not much else). Percentile-based to shrug off
    a few noisy/invalid pixels at the true min/max."""
    valid = background[background > 0]
    depth_top_mm = float(np.percentile(valid, low_pct))
    depth_bottom_mm = float(np.percentile(valid, high_pct))
    return depth_top_mm, depth_bottom_mm


def save_depth_range(depth_top_mm: float, depth_bottom_mm: float, background_path: str,
                      path: str = cfgmod.DEFAULT_CALIBRATION_PATH) -> None:
    calibration = cfgmod.Calibration(
        background_path=background_path,
        depth_top_mm=depth_top_mm,
        depth_bottom_mm=depth_bottom_mm,
    )
    cfgmod.save_calibration(calibration, path)
    print(f"[calibration] Saved calibration to {path}")


def load_depth_range(calibration: cfgmod.Calibration) -> Optional[Tuple[float, float]]:
    if calibration.depth_top_mm is None or calibration.depth_bottom_mm is None:
        return None
    return calibration.depth_top_mm, calibration.depth_bottom_mm
