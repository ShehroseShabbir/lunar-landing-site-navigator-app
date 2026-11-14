"""Terrain horizon profile for one site (plan.md section 5, DR-HACK-12).

720 great-circle rays at 0.5 deg azimuth. Along each ray the step is one pixel
of the grid in use: the 5 m site tile out to min(5 km, tile edge), then the
80 m grid while the sample is at or south of 80 S, then the 240 m grid while
it is at or south of 75 S, out to 300 km. Each sample's elevation angle is
exact in Moon-centred Cartesian coordinates; the horizon is the maximum.
"""

import numpy as np

from geometry import MOON_RADIUS_M, latlon_from_unit, ray_unit_vectors, unit_vector

AZ_STEP_DEG = 0.5
N_AZ = 720
MAX_RANGE_M = 300000.0
NEAR_MAX_M = 5000.0
MAST_M = 2.0


def _segment(grid, lat0, lon0, az, s_m, start_m, observer, up):
    """March one grid along every ray.

    Samples with s <= start_m (per ray) belong to an earlier grid. From there
    the segment runs while the grid has a finite height, and stops at the first
    gap (tile edge, latitude limit, raster edge). Returns per-ray maximum
    elevation (-inf if no sample), its distance, and where the segment ended.
    """
    pts = ray_unit_vectors(lat0, lon0, az, s_m)  # (A, S, 3)
    lat, lon = latlon_from_unit(pts)
    h = grid.sample_latlon(lat, lon)
    before = s_m[None, :] <= start_m[:, None]
    cont = np.isfinite(h) | before
    n = s_m.size
    first_bad = np.where(cont.all(axis=1), n, np.argmin(cont, axis=1))
    use = (np.arange(n)[None, :] < first_bad[:, None]) & ~before

    p = (MOON_RADIUS_M + np.where(use, h, 0.0))[..., None] * pts
    d = p - observer
    el = np.degrees(np.arcsin(np.clip((d @ up) / np.linalg.norm(d, axis=-1), -1.0, 1.0)))
    el = np.where(use, el, -np.inf)
    k = np.argmax(el, axis=1)
    rows = np.arange(el.shape[0])
    best = el[rows, k]
    dist = np.where(np.isfinite(best), s_m[k], np.nan)
    last = np.where(first_bad > 0, s_m[np.maximum(first_bad - 1, 0)], 0.0)
    end = np.where(use.any(axis=1), np.maximum(last, start_m), start_m)
    return best, dist, end


def compute_profile(lat_deg, lon_deg, near, far80, far240,
                    max_range_m=MAX_RANGE_M, near_max_m=NEAR_MAX_M, mast_m=MAST_M):
    """Horizon elevation (deg) and distance (km) for 720 azimuths from a site.

    near: 5 m site tile Grid or None (then the 80 m grid is the near field).
    far80 / far240: Grids with valid_below_lat set to -80 / -75.
    """
    az = np.arange(N_AZ) * AZ_STEP_DEG
    finest = near if near is not None else far80
    terrain_m = float(finest.sample_latlon(lat_deg, lon_deg))
    if not np.isfinite(terrain_m):
        raise ValueError(f"no terrain height at site ({lat_deg}, {lon_deg}) in {finest.name}")
    observer_height_m = terrain_m + mast_m
    up = unit_vector(lat_deg, lon_deg)
    observer = (MOON_RADIUS_M + observer_height_m) * up

    best = np.full(N_AZ, -np.inf)
    dist = np.full(N_AZ, np.nan)
    start = np.zeros(N_AZ)
    grids_used = []
    stages = []
    if near is not None:
        stages.append((near, min(near_max_m, max_range_m)))
    stages.append((far80, max_range_m))
    stages.append((far240, max_range_m))
    for grid, limit in stages:
        s = np.arange(1, int(np.floor(limit / grid.res + 1e-9)) + 1) * grid.res
        b, dd, end = _segment(grid, lat_deg, lon_deg, az, s, start, observer, up)
        if np.any(end > start):
            grids_used.append(grid.name)
        better = b > best
        best = np.where(better, b, best)
        dist = np.where(better, dd, dist)
        start = end

    if not np.all(np.isfinite(best)):
        raise ValueError("a ray has no terrain samples")
    return {
        "azDeg": az,
        "elevDeg": best,
        "distKm": dist / 1000.0,
        "reachKm": start / 1000.0,
        "minReachKm": float(start.min()) / 1000.0,
        "nearFieldResM": finest.res,
        "observerHeightM": observer_height_m,
        "terrainHeightM": terrain_m,
        "maxRangeKm": max_range_m / 1000.0,
        "gridsUsed": grids_used,
    }
