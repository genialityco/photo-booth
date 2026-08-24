"""Entry point.

Usage examples (run from kinect-roller-backend/):

    python -m src.main --calibrate-bg --mock         # capture background only
    python -m src.main --calibrate-depth --mock       # recapture background + click top/bottom
    python -m src.main --debug --mock                   # run + visualize (no hardware)
    python -m src.main --debug                            # run + visualize on real Kinect
    python -m src.main                                       # headless, logs + websocket only

Two detection methods (--method), shape is the default:
  shape  Detect the roller's own 22x7cm silhouette directly in the depth
         data, using true perpendicular distance to a fitted screen plane
         (not raw depth difference - see screen_plane.py). No color camera
         / MediaPipe needed. See roller_detector.py.
  hand   Track the hand gripping the roller with MediaPipe on the Kinect's
         color feed instead, and use the hand's position/proximity to the
         screen as a stand-in for the roller's. Tried as the default at one
         point; didn't pan out in practice, kept as an option - see
         hand_roller_detector.py.
"""
from __future__ import annotations

import argparse
import logging
import os
import time

import numpy as np

from . import calibration
from . import config as cfgmod
from .kinect_source import DepthSource, KinectDepthSource, MockDepthSource
from .ws_server import RollerWebSocketServer

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("main")


def build_source(use_mock: bool, enable_color: bool) -> DepthSource:
    if use_mock:
        logger.info("Using MockDepthSource (no Kinect hardware required)")
        return MockDepthSource(use_webcam_for_color=enable_color)
    return KinectDepthSource(enable_color=enable_color)


def ensure_background(source: DepthSource, config: cfgmod.RollerConfig,
                       calib: cfgmod.Calibration, force: bool, calibration_file: str) -> np.ndarray:
    path = calib.background_path or cfgmod.DEFAULT_BACKGROUND_PATH
    if force or not os.path.exists(path):
        background = calibration.capture_background(source, config, path)
        calib.background_path = path
        cfgmod.save_calibration(calib, calibration_file)
        return background
    return np.load(path)


def recalibrate_depth_range(source: DepthSource, config: cfgmod.RollerConfig,
                             background: np.ndarray, calib: cfgmod.Calibration,
                             calibration_file: str):
    """Shared 'c' key / --calibrate-depth handler: returns
    (depth_top_mm, depth_bottom_mm) or None if cancelled."""
    picked = calibration.pick_depth_range(source, config, background)
    if picked is None:
        return None
    depth_top_mm, depth_bottom_mm = picked
    bg_path = calib.background_path or cfgmod.DEFAULT_BACKGROUND_PATH
    calibration.save_depth_range(depth_top_mm, depth_bottom_mm, bg_path, calibration_file)
    return depth_top_mm, depth_bottom_mm


def run_shape_mode(args, config: cfgmod.RollerConfig, calib: cfgmod.Calibration,
                    source: DepthSource, background: np.ndarray, depth_range_mm) -> None:
    from .roller_detector import RollerDetector

    detector = RollerDetector(config, background, depth_range_mm)
    ws_server = RollerWebSocketServer(config.ws_host, config.ws_port)
    ws_server.start()

    debug_view = None
    if args.debug:
        from .debug_view import DebugView
        debug_view = DebugView(config)

    try:
        logger.info("Running (shape mode). Ctrl+C to stop.")
        min_broadcast_interval = 1.0 / config.broadcast_fps if config.broadcast_fps > 0 else 0.0
        last_broadcast = 0.0
        last_touch_state = None

        while True:
            frame = source.read()
            if frame is None:
                time.sleep(0.001)
                continue

            detection, candidates, mask = detector.detect(frame)

            now = time.time()
            if detection is not None and now - last_broadcast >= min_broadcast_interval:
                ws_server.broadcast(detection.to_json())
                last_broadcast = now
                if detection.touching != last_touch_state:
                    logger.info(
                        "roller %s at x=%.3f y=%.3f angle=%.0f h=%.0fmm",
                        "TOUCHING" if detection.touching else "hovering",
                        detection.x_norm, detection.y_norm,
                        detection.angle_deg, detection.top_height_mm,
                    )
                    last_touch_state = detection.touching
            elif detection is None and last_touch_state is not None:
                ws_server.broadcast({"type": "roller", "touching": False, "lost": True,
                                      "timestamp": now})
                logger.info("roller lost")
                last_touch_state = None

            if debug_view is not None:
                cmd = debug_view.render(frame, mask, detection, candidates, detector.depth_range_mm)
                if cmd == "quit":
                    break
                if cmd == "recalibrate_bg":
                    background = calibration.capture_background(
                        source, config, calib.background_path or cfgmod.DEFAULT_BACKGROUND_PATH)
                    detector.set_background(background)
                if cmd == "pick_corners":
                    result = recalibrate_depth_range(source, config, background, calib, args.calibration_file)
                    if result is not None:
                        detector.set_depth_range(result)
    finally:
        ws_server.stop()
        if debug_view is not None:
            debug_view.close()


def run_hand_mode(args, config: cfgmod.RollerConfig, calib: cfgmod.Calibration,
                   source: DepthSource, background: np.ndarray, depth_range_mm) -> None:
    from .hand_detector import HandDetector
    from .hand_roller_detector import HandRollerDetector

    hand_detector = HandDetector(
        max_num_hands=config.hand_max_num_hands,
        min_detection_confidence=config.hand_min_detection_confidence,
        min_tracking_confidence=config.hand_min_tracking_confidence,
    )
    detector = HandRollerDetector(config, background, depth_range_mm)
    ws_server = RollerWebSocketServer(config.ws_host, config.ws_port)
    ws_server.start()

    debug_view = None
    if args.debug:
        from .hand_debug_view import HandDebugView
        debug_view = HandDebugView(config)

    try:
        logger.info("Running (hand-tracking mode). Ctrl+C to stop.")
        min_broadcast_interval = 1.0 / config.broadcast_fps if config.broadcast_fps > 0 else 0.0
        last_broadcast = 0.0
        last_touch_state = None

        while True:
            depth_frame = source.read()
            color_frame = source.read_color()
            if depth_frame is None and color_frame is None:
                time.sleep(0.001)
                continue
            if depth_frame is not None:
                source.refresh_color_depth_mapping()

            hand_points = []
            detection = None
            if color_frame is not None:
                hand_points = hand_detector.detect(color_frame)
                if hand_points:
                    hp = hand_points[0]
                    depth_point = source.map_color_to_depth(hp.x_px, hp.y_px)
                    if depth_point is not None:
                        detection = detector.detect(depth_point, hp.label)

            now = time.time()
            if detection is not None and now - last_broadcast >= min_broadcast_interval:
                ws_server.broadcast(detection.to_json())
                last_broadcast = now
                if detection.touching != last_touch_state:
                    logger.info(
                        "roller %s at x=%.3f y=%.3f diff=%.0fmm hand=%s",
                        "TOUCHING" if detection.touching else "hovering",
                        detection.x_norm, detection.y_norm,
                        detection.diff_mm, detection.hand_label,
                    )
                    last_touch_state = detection.touching
            elif detection is None and last_touch_state is not None:
                ws_server.broadcast({"type": "roller", "touching": False, "lost": True,
                                      "timestamp": now})
                logger.info("roller lost")
                last_touch_state = None

            if debug_view is not None:
                cmd = debug_view.render(depth_frame, color_frame, hand_points, detection)
                if cmd == "quit":
                    break
                if cmd == "recalibrate_bg":
                    background = calibration.capture_background(
                        source, config, calib.background_path or cfgmod.DEFAULT_BACKGROUND_PATH)
                    detector.set_background(background)
                if cmd == "pick_corners":
                    result = recalibrate_depth_range(source, config, background, calib, args.calibration_file)
                    if result is not None:
                        detector.set_depth_range(result)
    finally:
        hand_detector.close()
        ws_server.stop()
        if debug_view is not None:
            debug_view.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Kinect v2 roller-reveal backend")
    parser.add_argument("--method", choices=["shape", "hand"], default="shape",
                         help="shape (default): detect the roller's own silhouette in depth, via "
                              "perpendicular distance to a fitted screen plane. hand: track the "
                              "hand via MediaPipe on the color feed instead.")
    parser.add_argument("--mock", action="store_true",
                         help="Use a synthetic depth source instead of a real Kinect v2")
    parser.add_argument("--debug", action="store_true",
                         help="Show the OpenCV debug window")
    parser.add_argument("--calibrate-bg", action="store_true",
                         help="(Re)capture the empty-screen background depth and exit")
    parser.add_argument("--calibrate-depth", action="store_true",
                         help="Recapture the background AND interactively click the top/bottom "
                              "of the screen to calibrate the depth->screen-Y mapping, and exit. "
                              "Pass --keep-bg to skip the background recapture.")
    parser.add_argument("--keep-bg", action="store_true",
                         help="With --calibrate-depth, reuse the existing background capture "
                              "instead of recapturing it.")
    parser.add_argument("--config", default=cfgmod.DEFAULT_CONFIG_PATH)
    parser.add_argument("--calibration-file", default=cfgmod.DEFAULT_CALIBRATION_PATH)
    parser.add_argument("--background-file", default=None,
                         help="Override where the background depth capture is read/written "
                              "(default: calibration.json's background_path, or "
                              "background_depth.npy). Useful to keep test runs from "
                              "clobbering your real captured background.")
    parser.add_argument("--host", default=None, help="Override websocket host")
    parser.add_argument("--port", type=int, default=None, help="Override websocket port")
    args = parser.parse_args()

    config = cfgmod.load_config(args.config)
    calib = cfgmod.load_calibration(args.calibration_file)
    if args.background_file:
        calib.background_path = args.background_file
    if args.host:
        config.ws_host = args.host
    if args.port:
        config.ws_port = args.port

    source = build_source(args.mock, enable_color=(args.method == "hand"))

    try:
        if args.calibrate_bg:
            ensure_background(source, config, calib, force=True, calibration_file=args.calibration_file)
            return

        if args.calibrate_depth:
            # Recapture the background here too by default: depth-range
            # calibration is meaningless against a stale/wrong background
            # (e.g. captured while something was in view - see README), and
            # since you're already standing there for the top/bottom click,
            # it costs nothing to also get a fresh one. Pass --keep-bg to
            # reuse the existing background instead.
            background = ensure_background(source, config, calib, force=not args.keep_bg,
                                            calibration_file=args.calibration_file)
            result = recalibrate_depth_range(source, config, background, calib, args.calibration_file)
            if result is None:
                logger.warning("Depth-range picking cancelled, not saved")
            return

        background = ensure_background(source, config, calib, force=False,
                                        calibration_file=args.calibration_file)
        depth_range_mm = calibration.load_depth_range(calib)
        if depth_range_mm is None:
            logger.warning(
                "No depth-range calibration found; screen-Y will fall back to raw image "
                "row (won't line up with the real screen) and off-screen filtering is "
                "disabled. Run --calibrate-depth once the rig is mounted."
            )

        if args.method == "hand":
            run_hand_mode(args, config, calib, source, background, depth_range_mm)
        else:
            run_shape_mode(args, config, calib, source, background, depth_range_mm)

    except KeyboardInterrupt:
        logger.info("Interrupted, shutting down")
    finally:
        source.close()


if __name__ == "__main__":
    main()
