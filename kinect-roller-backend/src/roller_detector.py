"""Roller detection from a Kinect depth frame.

Rig geometry
------------
The Kinect is mounted above the screen looking down along its face rather
than straight-on. That means:
  - screen-X maps directly to the image column (the camera is perpendicular
    on that axis, no calibration needed).
  - screen-Y (vertical position on the physical screen) is encoded in
    DEPTH, not image row: points near the top of the screen (closest to the
    Kinect) read a small depth, points near the bottom read a large one.
    depth_top_mm/depth_bottom_mm (calibrated once) bound that range.

Perpendicular distance, not raw depth diff
-------------------------------------------
Because the Kinect views the screen at a grazing angle rather than
straight-on, a naive per-pixel depth difference (background - current)
does NOT measure "distance in front of the screen" - it's entangled with
the point's position along the screen's own vertical extent, since depth
itself already encodes screen-Y. The same physical 5cm lift-off reads as a
different mm-diff depending on where on the screen it happens. We fix this
by fitting a 3D plane to the calibrated background (see screen_plane.py)
and computing true perpendicular distance to that plane for every pixel -
a slab of constant physical thickness in front of the screen, everywhere
on the screen, not just near wherever the camera happens to be looking
head-on.

Approach
--------
We calibrate a background depth map of the empty screen once, and fit a
ScreenPlane to it. On every frame:

1. Compute each pixel's perpendicular distance to the screen plane ->
   pixels within roughly 0-20cm in front of the screen
   (background_diff_min_mm..mask_height_max_mm, now plane-distance bounds,
   not raw depth-diff bounds) are candidate "roller" pixels (the roller
   occludes the screen whether it is touching it or hovering just above).
   Anything that stays in-band *continuously* for more than
   stale_suppress_seconds is then excluded (see _suppress_stale) - depth
   alone can't tell a deliberately-held touch apart from static clutter or
   plane-fit residual error, so TIME is the only lever: pick a threshold
   longer than any real single hold in your gesture.
2. A hand gripping the roller sits *taller* off the screen than the
   roller's own ~diameter ridge (fingers/knuckles stack on top of it), so
   the slab's upper bound excludes most of the hand from the mask up front
   - this is what actually separates "roller" from "hand holding roller".
   Denoise with morphology -> binary mask, find contours. Closing bridges
   gaps by PIXEL proximity only, with no idea how far out of range (in mm)
   whatever it bridges over actually is - so every measurement below
   (position, size, area, height) is computed from each contour's
   INTERSECTION with the true in-band mask, never from the closed
   contour's own raw shape. Closing is only used to decide which fragments
   belong together, not as the source of truth for where/how big the
   result is - otherwise a hand resting well outside the configured slab
   could still shift the reported position/size just by sitting a few
   pixels from genuinely in-band roller pixels.
3. Fit a rotated rectangle (cv2.minAreaRect) to each contour's in-band
   pixels and convert its pixel size to centimeters using the depth at that
   point (pinhole projection: size_mm = size_px * depth_mm / focal_length_px).
4. By default (`require_shape_match=False`), ANY contour in the slab above
   `min_contour_area_px` counts as a detection - the largest one is
   reported. Shape matching (contour AREA cm^2 + ELONGATION long/short
   side, `require_shape_match=True`) is available but off by default: a
   hand resting on the roller punches gaps through the height band at
   every finger, so a real detection is usually several disconnected,
   shorter pieces rather than one clean rectangle, which made exact
   size/aspect matching too brittle in practice to rely on as the primary
   gate.
5. Map each candidate's center to screen coordinates (direct X, depth-based
   Y - see above) and reject it if that Y falls outside the screen's own
   [0, 1] range by more than a small tolerance: something whose depth
   doesn't correspond to anywhere on the physical screen (an arm reaching
   in from off to the side, at a very different depth) is rejected here,
   without needing any 2D region-of-interest mask.
6. "Touching" gate: a cylinder of diameter D resting on a plane has its
   closest-to-camera point exactly D above that plane no matter where it
   sits. We use the largest plane-distance value inside the candidate (i.e.
   its highest point, genuinely perpendicular to the screen now) as a
   proxy for that height, and call it "touching" when that height is close
   to the known roller diameter - materially larger means the roller is
   lifted off the screen.
"""
from __future__ import annotations

import dataclasses
import time
from typing import List, Optional, Tuple

import cv2
import numpy as np

from .config import RollerConfig
from .screen_plane import ScreenPlane, fit_screen_plane


@dataclasses.dataclass
class Candidate:
    center_px: Tuple[float, float]
    length_px: float
    width_px: float
    angle_deg: float
    length_cm: float
    width_cm: float
    area_cm2: float
    elongation: float
    top_height_mm: float
    x_norm: float
    y_norm: float
    box_px: np.ndarray  # (4, 2) rotated-rect corners, for drawing
    accepted: bool
    reject_reason: str = ""


@dataclasses.dataclass
class Detection:
    touching: bool
    x_norm: float
    y_norm: float
    center_px: Tuple[float, float]
    angle_deg: float
    length_cm: float
    width_cm: float
    top_height_mm: float
    timestamp: float = dataclasses.field(default_factory=time.time)

    def to_json(self) -> dict:
        return {
            "type": "roller",
            "touching": self.touching,
            "x": round(self.x_norm, 4),
            "y": round(self.y_norm, 4),
            "angle_deg": round(self.angle_deg, 1),
            "length_cm": round(self.length_cm, 1),
            "width_cm": round(self.width_cm, 1),
            "height_mm": round(self.top_height_mm, 1),
            "timestamp": self.timestamp,
        }


class RollerDetector:
    def __init__(self, config: RollerConfig, background: np.ndarray,
                 depth_range_mm: Optional[Tuple[float, float]] = None):
        self.config = config
        self.background = background.astype(np.float32)
        self.depth_range_mm = depth_range_mm  # (depth_top_mm, depth_bottom_mm) or None
        self.plane: ScreenPlane = self._fit_plane(self.background)
        self._row_depth_curve = self._compute_row_depth_curve(self.background)
        self._open_kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (config.morph_open_kernel_size, config.morph_open_kernel_size)
        )
        self._close_kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (config.morph_close_kernel_size, config.morph_close_kernel_size)
        )
        # Per-pixel timestamp of when it *last* became continuously in_band;
        # NaN means it's not currently flagged. See _suppress_stale().
        self._persist_start: Optional[np.ndarray] = None

    def _fit_plane(self, background: np.ndarray) -> ScreenPlane:
        cfg = self.config
        depth_range_for_fit = None if cfg.plane_fit_use_full_depth else self.depth_range_mm
        return fit_screen_plane(
            background, fx=cfg.focal_length_px, fy=cfg.focal_length_px,
            cx=cfg.depth_width / 2.0, cy=cfg.depth_height / 2.0,
            depth_range_mm=depth_range_for_fit,
        )

    def set_background(self, background: np.ndarray) -> None:
        self.background = background.astype(np.float32)
        self.plane = self._fit_plane(self.background)
        self._row_depth_curve = self._compute_row_depth_curve(self.background)
        self._persist_start = None

    def _compute_row_depth_curve(self, background: np.ndarray) -> np.ndarray:
        """Per-row median background depth, with rows that have NO valid
        pixel at all filled in by interpolating from nearby rows that do.

        Why: this is used as a FALLBACK size (mm_per_px) and Y reference for
        when a detected candidate has no valid raw depth reading of its own
        this frame (see detect()) - on a rig where much of the Kinect's view
        has no valid reading (common: most of a screen is out of the
        sensor's reliable range, or reflective), that can happen easily.
        Originally this fallback value was fed directly into the Y
        calculation for every detection (not just as a fallback), which
        caused two bugs at different times: first a raw single-pixel lookup
        giving a bogus, constant, wildly out-of-[0,1] "Y" no matter where
        the roller actually was (the reported "y stays fixed at -3.79 even
        moving the roller a meter" bug), and later - after being replaced by
        this smoothed-but-row-only curve - a Y that barely moved at all,
        because image ROW barely changes with vertical movement on this
        grazing-angle rig (see module docstring: Y is encoded in DEPTH, not
        row). Y now uses the candidate's own live depth reading instead;
        this curve only fills gaps where that live reading is missing."""
        h, w = background.shape
        row_depth = np.full(h, np.nan, dtype=np.float64)
        for row in range(h):
            row_valid = background[row][background[row] > 0]
            if row_valid.size > 0:
                row_depth[row] = np.median(row_valid)

        known = ~np.isnan(row_depth)
        if known.sum() < 2:
            fallback = float(np.nanmedian(row_depth)) if known.any() else 0.0
            return np.full(h, fallback, dtype=np.float64)

        rows = np.arange(h)
        return np.interp(rows, rows[known], row_depth[known])

    def set_depth_range(self, depth_range_mm: Optional[Tuple[float, float]]) -> None:
        self.depth_range_mm = depth_range_mm
        # Re-fit: knowing the screen's depth span lets the plane fit ignore
        # floor/walls/furniture outside it, which matters a lot when the
        # screen is only a small fraction of the Kinect's full view.
        self.plane = self._fit_plane(self.background)

    def detect(self, depth: np.ndarray) -> Tuple[Optional[Detection], List[Candidate], np.ndarray]:
        cfg = self.config
        dist = self.plane.distance_map(depth)
        if cfg.plane_offset_mm:
            dist = dist - cfg.plane_offset_mm

        in_band = (dist > cfg.background_diff_min_mm) & (dist <= cfg.mask_height_max_mm)
        # Filtro grueso en Z crudo (distancia real al sensor, no al plano):
        # descarta cualquier cosa más lejos que max_raw_depth_mm, p.ej.
        # alguien caminando de fondo cuya altura respecto al plano ajustado
        # cae en rango por casualidad pero está muy lejos del Kinect.
        in_band = in_band & (depth > 0) & (depth <= cfg.max_raw_depth_mm)
        if cfg.stale_suppress_enabled:
            in_band = self._suppress_stale(in_band)
        mask = in_band.astype(np.uint8) * 255
        if cfg.morph_open_iterations:
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, self._open_kernel,
                                     iterations=cfg.morph_open_iterations)
        if cfg.morph_close_iterations:
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, self._close_kernel,
                                     iterations=cfg.morph_close_iterations)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        candidates: List[Candidate] = []
        for contour in contours:
            # Closing bridges the mask across gaps (e.g. a finger punching
            # through the roller) purely by PIXEL proximity, with no idea
            # how far out of range (in mm) whatever it bridged over
            # actually is - a hand resting well above mask_height_max_mm
            # can still get pulled into the contour if it's only a few
            # pixels away from genuinely in-band roller pixels. So every
            # measurement below (position, size, area, height) is computed
            # from the closed contour's INTERSECTION with the true in_band
            # mask, never from the closed contour's own raw shape - closing
            # is used only to decide which fragments belong together, not
            # as the source of truth for where/how big the result is.
            contour_mask = np.zeros(mask.shape, dtype=np.uint8)
            cv2.drawContours(contour_mask, [contour], -1, 255, thickness=cv2.FILLED)
            in_band_mask = ((contour_mask == 255) & in_band).astype(np.uint8)

            area_px = int(np.count_nonzero(in_band_mask))
            if area_px < cfg.min_contour_area_px:
                continue

            points = cv2.findNonZero(in_band_mask)
            rect = cv2.minAreaRect(points)
            (cx, cy), (w_px, h_px), angle = rect
            length_px, width_px = (w_px, h_px) if w_px >= h_px else (h_px, w_px)
            if length_px <= 0 or width_px <= 0:
                continue
            # cv2 angle refers to the (w_px) side; normalize so angle always
            # describes the long side of the rectangle.
            long_angle = angle if w_px >= h_px else angle + 90.0

            region = dist[in_band_mask == 1]
            if region.size == 0:
                continue
            top_height_mm = float(np.percentile(region, 95))  # robust "closest point"

            # The background's exact pixel here is very often invalid (0) on
            # rigs where much of the Kinect's view has no valid reading -
            # use the interpolated per-row curve as a FALLBACK for the size
            # (mm_per_px) calculation below, for when this frame's own raw
            # reading under the candidate is also invalid.
            row_idx = min(max(int(round(cy)), 0), len(self._row_depth_curve) - 1)
            bg_depth_at_center = float(self._row_depth_curve[row_idx])

            # Screen-Y comes from THIS frame's raw depth reading at the
            # candidate itself, not from image row (see module docstring):
            # on this grazing-angle rig, physical up/down movement on the
            # screen barely shifts which row the roller appears in, but
            # shifts its raw depth a lot - a per-row background curve is too
            # coarse (and, critically, doesn't move at all as the object
            # moves) to carry that signal. Only fall back to the background
            # curve when every raw pixel under the candidate is itself
            # invalid (sensor dropout), to avoid resurrecting the old
            # "y frozen at a garbage constant" bug.
            live_depth_vals = depth[in_band_mask == 1]
            live_depth_vals = live_depth_vals[live_depth_vals > 0]
            depth_for_y = float(np.median(live_depth_vals)) if live_depth_vals.size else bg_depth_at_center

            depth_at_center = max(bg_depth_at_center - top_height_mm, 1.0)
            mm_per_px = depth_at_center / cfg.focal_length_px
            length_cm = length_px * mm_per_px / 10.0
            width_cm = width_px * mm_per_px / 10.0
            area_cm2 = area_px * (mm_per_px / 10.0) ** 2
            elongation = length_px / width_px

            x_norm, y_norm = self._to_screen_norm((cx, cy), depth_for_y)

            box_px = cv2.boxPoints(rect)

            accepted, reason = self._evaluate_shape(area_cm2, elongation, y_norm)
            candidates.append(Candidate(
                center_px=(float(cx), float(cy)),
                length_px=float(length_px),
                width_px=float(width_px),
                angle_deg=float(long_angle % 180.0),
                length_cm=length_cm,
                width_cm=width_cm,
                area_cm2=area_cm2,
                elongation=elongation,
                top_height_mm=top_height_mm,
                x_norm=x_norm,
                y_norm=y_norm,
                box_px=box_px,
                accepted=accepted,
                reject_reason=reason,
            ))

        best = self._pick_best(candidates)
        detection = None
        if best is not None:
            touching = cfg.touch_height_min_mm <= best.top_height_mm <= cfg.touch_height_max_mm
            detection = Detection(
                touching=touching,
                x_norm=best.x_norm,
                y_norm=best.y_norm,
                center_px=best.center_px,
                angle_deg=best.angle_deg,
                length_cm=best.length_cm,
                width_cm=best.width_cm,
                top_height_mm=best.top_height_mm,
            )

        return detection, candidates, mask

    def _suppress_stale(self, in_band: np.ndarray) -> np.ndarray:
        """Tracks, per pixel, how long it's been *continuously* in_band
        (resets the instant it drops out, even briefly) and excludes
        anything held that way for longer than stale_suppress_seconds.
        Applies uniformly across the whole slab (touching and hovering
        both) - see the config field's docstring for why an
        only-suppress-hovering carve-out doesn't actually work (static
        clutter can easily sit at touching height too)."""
        now = time.time()
        if self._persist_start is None or self._persist_start.shape != in_band.shape:
            self._persist_start = np.full(in_band.shape, np.nan, dtype=np.float64)

        just_started = in_band & np.isnan(self._persist_start)
        self._persist_start[just_started] = now
        self._persist_start[~in_band] = np.nan

        age = now - self._persist_start  # NaN outside in_band; NaN comparisons are False below
        stale = in_band & (age > self.config.stale_suppress_seconds)
        return in_band & ~stale if np.any(stale) else in_band

    def _evaluate_shape(self, area_cm2: float, elongation: float, y_norm: float) -> Tuple[bool, str]:
        cfg = self.config
        if cfg.require_shape_match:
            if area_cm2 < cfg.min_area_cm2:
                return False, f"area {area_cm2:.0f}cm2 too small"
            if area_cm2 > cfg.max_area_cm2:
                return False, f"area {area_cm2:.0f}cm2 too large"
            if elongation < cfg.min_elongation:
                return False, f"elongation {elongation:.2f} too round"
        if cfg.require_on_screen_y and self.depth_range_mm is not None:
            tol = cfg.screen_y_tolerance
            if not (-tol <= y_norm <= 1 + tol):
                return False, f"y={y_norm:.2f} off-screen"
        return True, ""

    def _pick_best(self, candidates: List[Candidate]) -> Optional[Candidate]:
        accepted = [c for c in candidates if c.accepted]
        if not accepted:
            return None

        if self.config.require_shape_match:
            nominal_area = self.config.roller_length_cm * self.config.roller_width_cm

            def score(c: Candidate) -> float:
                # Prefer candidates closer to the full roller footprint - a
                # bigger, more complete piece is more likely to be the
                # roller itself than a stray fragment or an unrelated
                # object.
                return abs(c.area_cm2 - nominal_area)

            return min(accepted, key=score)

        # No shape filtering: report the single largest thing in the slab -
        # with a hand+roller both in view that's normally the hand+roller
        # mass together, which is good enough to drive a position/touch
        # signal even without isolating the roller itself.
        return max(accepted, key=lambda c: c.area_cm2)

    def _to_screen_norm(self, center_px: Tuple[float, float], depth_mm: float) -> Tuple[float, float]:
        # Screen-X: direct, the camera is perpendicular on this axis.
        x_norm = center_px[0] / self.config.depth_width
        # Screen-Y: derived from depth (see module docstring) once calibrated;
        # otherwise fall back to image row (better than nothing, but won't
        # line up with the real screen until depth_top_mm/depth_bottom_mm
        # are set). `depth_mm` should be the candidate's own live reading
        # (see detect()), not a row/background-derived value - it's the one
        # thing that actually varies with vertical movement on this rig.
        if self.depth_range_mm is None:
            y_norm = center_px[1] / self.config.depth_height
        else:
            depth_top_mm, depth_bottom_mm = self.depth_range_mm
            span = (depth_bottom_mm - depth_top_mm) * self.config.y_span_scale
            y_norm = (depth_mm - depth_top_mm) / span if span else 0.0
            # y_sensitivity != 1.0 rescales around the center (0.5) instead
            # of the raw [0,1] the calibrated span implies - a rig where
            # the two --calibrate-depth clicks ended up close together (or
            # the screen's real depth span is just inherently narrow, e.g.
            # the Kinect mounted close to the screen) makes a tiny physical
            # movement swing across most of [0,1]. Values > 1 calm that
            # down (more real movement needed to cover the same range);
            # < 1 exaggerates it. Doesn't fix the underlying narrow
            # calibration, just compensates for it without redoing
            # --calibrate-depth.
            if self.config.y_sensitivity != 1.0:
                y_norm = 0.5 + (y_norm - 0.5) / self.config.y_sensitivity
        return x_norm, y_norm
