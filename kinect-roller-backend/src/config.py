"""Configuration for the roller detector.

Two files on disk:
  - config.json        tunable parameters, safe to commit (no machine-specific data).
  - calibration.json    produced by calibration routines (background depth stats,
                         depth->screen-Y range). Machine/rig specific -> gitignored.
"""
from __future__ import annotations

import dataclasses
import json
import os
from typing import Optional

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(THIS_DIR)
DEFAULT_CONFIG_PATH = os.path.join(ROOT_DIR, "config.json")
DEFAULT_CALIBRATION_PATH = os.path.join(ROOT_DIR, "calibration.json")
DEFAULT_BACKGROUND_PATH = os.path.join(ROOT_DIR, "background_depth.npy")


@dataclasses.dataclass
class RollerConfig:
    # --- Kinect depth stream ---
    depth_width: int = 512
    depth_height: int = 424
    # Approximate Kinect v2 depth-camera intrinsics (public factory-average
    # values). Good enough to turn a pixel size into a physical size; redo
    # calibration if you need higher precision.
    focal_length_px: float = 365.6

    # --- Physical roller, viewed from directly above ---
    roller_length_cm: float = 22.0   # long side of the rectangle
    roller_width_cm: float = 7.0     # short side of the rectangle (= roller diameter)

    # --- Screen plane fit sampling ---
    # By default, once depth_top_mm/depth_bottom_mm are calibrated, the
    # plane fit (screen_plane.py) only samples background points within
    # roughly that depth span (+/- margin) - this helps RANSAC when the
    # screen is a small fraction of the Kinect's full view (floor/walls
    # elsewhere in frame won't contaminate the fit). But if that calibrated
    # span is itself wrong or too narrow (e.g. the two --calibrate-depth
    # clicks ended up close together, or much of the screen is out of the
    # Kinect's valid sensing range so only a thin sliver of it ever got
    # clicked), this restriction throws away legitimate background data
    # instead of helping. Set this to True to fit the plane over ALL valid
    # background pixels regardless of the calibrated depth range.
    plane_fit_use_full_depth: bool = False
    # Distance (mm) subtracted from every raw plane-distance reading before
    # background_diff_min_mm/mask_height_max_mm/touch_height_*_mm are
    # applied - a manual fine-tune for where "at the screen" (distance 0)
    # actually is, without needing to redo the whole calibration. The fitted
    # plane (screen_plane.py) doesn't always land exactly on the true
    # screen surface (RANSAC residual, a narrow/imperfect background
    # capture, etc.) - if the empty screen reads as a small but nonzero
    # distance instead of ~0mm, set this to that amount to correct it.
    # Positive = push the effective zero point farther out (use when the
    # plane reads too close/too much "already foreground"); negative = pull
    # it in. Watch the `h=` value in --debug over the truly empty screen to
    # find the right number.
    plane_offset_mm: float = 0.0

    # --- Detection thresholds ---
    # These two bound a slab of constant physical thickness in front of the
    # screen (perpendicular distance to the fitted screen plane, in mm - see
    # screen_plane.py - NOT a raw depth difference, which would be skewed by
    # the Kinect's grazing viewing angle on the screen).
    #
    # A pixel counts as "roller" when it is at least this far in front of
    # the screen plane (mm).
    background_diff_min_mm: float = 10.0
    # ...and at most this far - roughly the "reach zone" in front of the
    # screen we bother looking at (~20cm). A hand gripping the roller is
    # taller than the roller itself (fingers/knuckles stack on top of the
    # ~diameter ridge), so as long as this stays close to the intended 20cm
    # reach zone rather than being pushed way out, it also helps exclude the
    # bulk of the hand/arm mass from the mask before contour analysis.
    #
    # IMPORTANT: this must be comfortably ABOVE the roller's own diameter
    # (roller_width_cm, ~70mm), not close to 0 - the roller's own top ridge
    # sits at ~diameter height, so a small value here would mask out the
    # roller itself, not just the hand.
    mask_height_max_mm: float = 200.0
    # If True, also require candidates to match the roller's expected
    # area/elongation (below) before accepting them. If False (the
    # default), ANYTHING in the slab above min_contour_area_px counts as a
    # detection - the largest such blob is reported. Turn this on only once
    # plain slab detection is confirmed working and you want to start
    # rejecting hands/arms by shape again.
    require_shape_match: bool = False
    # Contour area (cm^2, converted from pixels via depth) must fall in this
    # range to be considered (only checked when require_shape_match=True).
    # Deliberately loose on the low end: fingers resting across the roller
    # get excluded by the height band above and split the visible roller
    # into several shorter pieces, so a real detection is often well under
    # the full length_cm x width_cm footprint.
    min_area_cm2: float = 35.0
    max_area_cm2: float = 260.0
    # Reject near-round blobs (a fist, a fingertip): min length/width ratio
    # of the fitted rotated rectangle (only checked when
    # require_shape_match=True). Deliberately looser than the roller's true
    # ~3.1 aspect ratio, since occlusion can shorten the visible piece.
    min_elongation: float = 1.3
    # Minimum contour area in pixels before we even consider a blob (removes
    # sensor-noise specks). Applied regardless of require_shape_match.
    min_contour_area_px: int = 80
    # If True (and depth_top_mm/depth_bottom_mm are calibrated), reject
    # candidates whose derived screen-Y falls outside [0,1] by more than
    # screen_y_tolerance - e.g. an arm reaching in from off-screen sits at a
    # depth well outside the screen's own depth range. Off by default: this
    # derived Y is sensitive to exactly where the two calibration clicks
    # landed, and a narrow/imprecise click pair can make it reject the
    # roller everywhere. Turn on only once --calibrate-depth is confirmed
    # accurate (watch the reported `y=` value in --debug stay within
    # [0,1] as you move the roller across the whole screen).
    require_on_screen_y: bool = False
    screen_y_tolerance: float = 0.15
    # Rescales the derived screen-Y around its center (0.5) instead of
    # taking the calibrated [0,1] at face value. On a rig where the depth
    # span the screen actually covers is narrow (the two --calibrate-depth
    # clicks landed close together, or the screen's real depth span is
    # just inherently narrow - e.g. the Kinect mounted close to it), a
    # small physical movement of the roller swings across most of [0,1].
    # Values > 1.0 calm that down (more real movement needed to cover the
    # same reported range); values < 1.0 exaggerate it. This does not fix
    # the underlying narrow calibration - it just compensates for it
    # without redoing --calibrate-depth. Tune by watching `y=` in --debug
    # while moving the roller a known, comfortable distance.
    y_sensitivity: float = 1.0

    # --- Stale/static suppression ---
    # A region that reads as "in front of the screen" continuously for
    # longer than this (seconds) is ignored, not reported as a detection.
    # This is a blunt instrument by design: depth alone can't tell a
    # deliberately-held touch apart from static clutter/plane-fit residual
    # error (both look like "unmoving, in the slab") - the only lever we
    # have is TIME. Pick a threshold comfortably longer than any real single
    # continuous hold in your reveal gesture, but short enough that clutter
    # doesn't linger for ages. Applies uniformly across the whole slab
    # (touching and hovering both) - an earlier version exempted the
    # touching band specifically, but that meant static clutter that
    # happens to sit at touching height (very plausible - it's an ordinary
    # height for furniture) never got suppressed, defeating the point.
    #
    # If this cuts off a genuinely long deliberate hold, raise it. If
    # static clutter still lingers too long before disappearing, lower it.
    # The real fix for chronic false detections is a clean background
    # capture and a good screen-plane fit (see screen_plane.py's logged
    # inlier_ratio) - this setting is a safety net on top of that, not a
    # substitute for it.
    stale_suppress_enabled: bool = True
    stale_suppress_seconds: float = 15.0

    # --- "Touching the screen" gate ---
    # A cylinder of diameter D resting flat on a plane has its highest point
    # exactly D above that plane, regardless of where on the screen it sits.
    # We use the closest point of the candidate blob (max perpendicular
    # plane-distance, see screen_plane.py) as a proxy for "how high is the
    # roller above the screen" and call it "touching" when that value sits
    # close to the roller diameter. Tune these two after measuring your
    # real roller.
    touch_height_min_mm: float = 35.0
    touch_height_max_mm: float = 110.0

    # --- Morphology (denoise the raw threshold mask) ---
    # Small kernel to remove salt-and-pepper sensor noise.
    morph_open_kernel_size: int = 3
    morph_open_iterations: int = 1
    # Larger kernel to bridge the gaps a hand's fingers punch across the
    # roller (fingers are ~1.5-2.5cm wide -> need a kernel comparable to
    # that in pixels, tune against your depth scale if pieces still don't
    # merge). Without this, the roller shows up as several small,
    # near-square fragments instead of one elongated blob.
    morph_close_kernel_size: int = 15
    morph_close_iterations: int = 2

    # --- Hand-tracking (MediaPipe) detection mode ---
    hand_max_num_hands: int = 1
    hand_min_detection_confidence: float = 0.6
    hand_min_tracking_confidence: float = 0.6
    # "Touching" gate for hand mode: diff = background_mm - hand_depth_mm at
    # the hand's mapped depth-space point. The palm sits above the actual
    # roller-to-screen contact point (the roller is gripped below it), so
    # this needs its own empirical calibration, separate from the roller's
    # own diameter - watch the live diff value in --debug while touching/
    # lifting the real roller and adjust these two.
    hand_touch_min_mm: float = 20.0
    hand_touch_max_mm: float = 180.0

    # --- Background capture ---
    background_capture_frames: int = 30

    # --- WebSocket server ---
    ws_host: str = "0.0.0.0"
    ws_port: int = 8765
    # Broadcast at most this many updates per second.
    broadcast_fps: float = 20.0

    # --- Debug view ---
    depth_view_min_mm: float = 400.0
    depth_view_max_mm: float = 1500.0

    @property
    def expected_aspect_ratio(self) -> float:
        return self.roller_length_cm / self.roller_width_cm

    def to_json(self) -> dict:
        return dataclasses.asdict(self)

    @classmethod
    def from_json(cls, data: dict) -> "RollerConfig":
        known = {f.name for f in dataclasses.fields(cls)}
        filtered = {k: v for k, v in data.items() if k in known}
        return cls(**filtered)


def load_config(path: str = DEFAULT_CONFIG_PATH) -> RollerConfig:
    if not os.path.exists(path):
        cfg = RollerConfig()
        save_config(cfg, path)
        return cfg
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return RollerConfig.from_json(data)


def save_config(config: RollerConfig, path: str = DEFAULT_CONFIG_PATH) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(config.to_json(), f, indent=2, ensure_ascii=False)


@dataclasses.dataclass
class Calibration:
    background_path: Optional[str] = None
    # The Kinect looks down along the face of the screen from above rather
    # than straight-on, so screen-Y (vertical position on the physical
    # screen) is encoded in DEPTH, not image row: depth_top_mm is the
    # reading at the top edge of the screen (closest to the Kinect),
    # depth_bottom_mm at the bottom edge (farthest). Screen-X maps directly
    # to the image column (no calibration needed there - the camera is
    # perpendicular on that axis).
    depth_top_mm: Optional[float] = None
    depth_bottom_mm: Optional[float] = None

    def to_json(self) -> dict:
        return dataclasses.asdict(self)

    @classmethod
    def from_json(cls, data: dict) -> "Calibration":
        return cls(
            background_path=data.get("background_path"),
            depth_top_mm=data.get("depth_top_mm"),
            depth_bottom_mm=data.get("depth_bottom_mm"),
        )


def load_calibration(path: str = DEFAULT_CALIBRATION_PATH) -> Calibration:
    if not os.path.exists(path):
        return Calibration()
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return Calibration.from_json(data)


def save_calibration(calibration: Calibration, path: str = DEFAULT_CALIBRATION_PATH) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(calibration.to_json(), f, indent=2, ensure_ascii=False)
