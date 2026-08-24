"""Fits a 3D plane to the calibrated background depth map and computes true
perpendicular distance from that plane for any depth reading.

Why this exists: the Kinect looks down along the screen's face at a
grazing angle, not straight-on/perpendicular to it (see
kinect_source.py / calibration.py docstrings on the depth<->screen-Y
mapping). Under that geometry, a naive per-pixel depth difference
(background_depth - current_depth) does NOT measure "distance in front of
the screen" - it's a mix of that and the point's position along the
screen's own vertical extent, because depth itself already encodes screen-Y.
A hand held at the exact same physical distance off the screen reads a
different mm-diff depending on where on the screen it is, which made the
old height-band thresholds inconsistent across the frame.

The fix: back-project the calibrated background into 3D camera-space
points (standard pinhole deprojection) and fit a plane to them. For any
new depth reading, its perpendicular (signed) distance to that plane is the
physically correct "how far in front of the screen is this point" value,
regardless of viewing angle.

Why RANSAC, not plain least-squares: the Kinect's view is rarely FILLED
edge-to-edge by just the screen - there's usually some floor, wall, or
other furniture visible around its edges, at a different depth/orientation
than the screen. A plain least-squares (SVD) fit is not robust to that: it
minimizes total squared distance, so even a modest fraction of off-plane
points can drag the fitted plane away from the screen's true orientation,
which then makes every downstream distance reading wrong (things that are
actually far away can read as "close to the screen" and vice versa - this
was the actual reported bug). RANSAC instead finds the plane most points
agree with and only fits to that inlier set, ignoring whatever else the
Kinect happens to see around the screen.
"""
from __future__ import annotations

import dataclasses
import logging

import numpy as np

logger = logging.getLogger("screen_plane")


@dataclasses.dataclass
class ScreenPlane:
    normal: np.ndarray  # (3,) unit vector, points from the screen toward the camera/room
    point: np.ndarray   # (3,) a point on the plane, mm, camera space
    fx: float
    fy: float
    cx: float
    cy: float
    inlier_ratio: float = 1.0  # fraction of background points that agreed with this plane

    def distance_map(self, depth: np.ndarray) -> np.ndarray:
        """Perpendicular distance (mm) from the plane for every pixel;
        positive = in front of the screen (toward the camera). Invalid
        (zero-depth) pixels get a large negative sentinel so they never
        pass a >0 threshold."""
        h, w = depth.shape
        ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
        valid = depth > 0
        X = (xs - self.cx) * depth / self.fx
        Y = (ys - self.cy) * depth / self.fy
        Z = depth
        dist = ((X - self.point[0]) * self.normal[0] +
                (Y - self.point[1]) * self.normal[1] +
                (Z - self.point[2]) * self.normal[2])
        dist[~valid] = -1.0e6
        return dist.astype(np.float32)

    def distance_at(self, row: int, col: int, depth_mm: float) -> float:
        x = (col - self.cx) * depth_mm / self.fx
        y = (row - self.cy) * depth_mm / self.fy
        p = np.array([x, y, depth_mm], dtype=np.float64)
        return float(np.dot(p - self.point, self.normal))


def _to_points(background: np.ndarray, fx: float, fy: float, cx: float, cy: float,
               sample_stride: int, depth_range_mm=None, depth_margin_mm: float = 150.0) -> np.ndarray:
    h, w = background.shape
    ys, xs = np.mgrid[0:h:sample_stride, 0:w:sample_stride].astype(np.float32)
    z = background[0:h:sample_stride, 0:w:sample_stride]
    valid = z > 0
    if depth_range_mm is not None:
        # Restrict candidate points to (roughly) the screen's own calibrated
        # depth span, so floor/walls/furniture visible around the screen
        # in the Kinect's field of view - often the MAJORITY of the frame -
        # never even get considered by the plane fit below.
        lo = min(depth_range_mm) - depth_margin_mm
        hi = max(depth_range_mm) + depth_margin_mm
        valid &= (z >= lo) & (z <= hi)
    xs, ys, z = xs[valid], ys[valid], z[valid]
    x3 = (xs - cx) * z / fx
    y3 = (ys - cy) * z / fy
    return np.stack([x3, y3, z], axis=1).astype(np.float64)


def _ransac_plane(points: np.ndarray, ransac_iterations: int, ransac_threshold_mm: float,
                   rng: np.random.Generator):
    """Returns (best_inliers, best_count) - best_inliers is None if no
    non-degenerate sample produced a usable plane at all."""
    n = points.shape[0]
    best_inliers = None
    best_count = -1
    for _ in range(ransac_iterations):
        idx = rng.choice(n, size=3, replace=False)
        p1, p2, p3 = points[idx]
        normal = np.cross(p2 - p1, p3 - p1)
        norm_len = np.linalg.norm(normal)
        if norm_len < 1e-9:
            continue  # 3 (near-)collinear points, degenerate plane
        normal = normal / norm_len
        dist = np.abs((points - p1) @ normal)
        count = int((dist < ransac_threshold_mm).sum())
        if count > best_count:
            best_count = count
            best_inliers = dist < ransac_threshold_mm
    return best_inliers, best_count


def fit_screen_plane(background: np.ndarray, fx: float, fy: float,
                      cx: float, cy: float, sample_stride: int = 2,
                      ransac_iterations: int = 300, ransac_threshold_mm: float = 15.0,
                      random_seed: int = 0, depth_range_mm=None) -> ScreenPlane:
    """RANSAC plane fit to the background's 3D point cloud: robust to the
    Kinect's view including things other than the screen (floor, walls,
    furniture) around its edges. Pass the calibrated depth_range_mm
    (depth_top_mm, depth_bottom_mm) if you have it - restricting candidate
    points to roughly that depth span up front makes the fit far more
    reliable when the screen is a small fraction of the Kinect's full view.

    Degrades gracefully rather than raising when the depth-range restriction
    (or even RANSAC itself) doesn't have enough to work with: a worse plane
    still lets detection run, whereas raising here would take down the
    whole process over what's usually a stale/slightly-off calibration."""
    points = _to_points(background, fx, fy, cx, cy, sample_stride, depth_range_mm)
    n = points.shape[0]
    if n < 100 and depth_range_mm is not None:
        logger.warning(
            "Only %d background pixels fall within the calibrated depth range "
            "(+/- margin) - depth_top_mm/depth_bottom_mm may be stale. Falling back to "
            "fitting the plane over the whole background. Run --calibrate-depth again "
            "if detection still looks wrong.", n,
        )
        points = _to_points(background, fx, fy, cx, cy, sample_stride, depth_range_mm=None)
        n = points.shape[0]

    if n < 100:
        raise ValueError(
            "Not enough valid background pixels to fit a screen plane at all - is "
            "background_depth.npy a real capture? Try --calibrate-bg again."
        )

    rng = np.random.default_rng(random_seed)
    best_inliers, best_count = _ransac_plane(points, ransac_iterations, ransac_threshold_mm, rng)

    if best_inliers is None:
        raise ValueError(
            "RANSAC could not find any usable plane in the background (all sampled points "
            "were degenerate/collinear) - try --calibrate-bg again."
        )
    if best_count < max(50, 0.1 * n):
        logger.warning(
            "RANSAC's best plane only has %d/%d inlier points - the Kinect's view may not "
            "be mostly filled by the screen. Proceeding with the best plane found; "
            "recapturing the background (--calibrate-bg) with the Kinect aimed more "
            "squarely at the screen may help.", best_count, n,
        )

    inlier_points = points[best_inliers]
    centroid = inlier_points.mean(axis=0)
    _, _, vt = np.linalg.svd(inlier_points - centroid, full_matrices=False)
    normal = vt[2]
    normal = normal / np.linalg.norm(normal)
    # Orient the normal to point from the screen toward the camera (the
    # coordinate origin in camera space) rather than away from it, so
    # "in front of the screen" reads as a positive distance.
    if np.dot(normal, -centroid) < 0:
        normal = -normal

    inlier_ratio = best_count / n
    logger.info("Screen plane fit: %d/%d points inliers (%.0f%%), normal=%s",
                best_count, n, inlier_ratio * 100, np.round(normal, 3))
    if inlier_ratio < 0.5:
        logger.warning(
            "Only %.0f%% of the background agrees with the fitted plane - the Kinect's "
            "view may include a lot of non-screen surface (floor/walls/furniture), "
            "which can make distance-from-screen readings unreliable.",
            inlier_ratio * 100,
        )

    return ScreenPlane(normal=normal, point=centroid, fx=fx, fy=fy, cx=cx, cy=cy,
                        inlier_ratio=inlier_ratio)
