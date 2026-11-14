"""Tests for the S8 terrain tiles. Run: python -m unittest discover scripts/horizon"""

import json
import os
import unittest

import numpy as np

from dem import Grid
from sites import SITES
from geometry import MOON_RADIUS_M, destination_point, south_stereo_xy
from terrain_tile import (HALF_WIDTH_M, SIZE, SPACING_M, WIDE_HALF_WIDTH_M, WIDE_SPACING_M,
                          crop_grid, decode_uint16, downsample_grid, encode_uint16, fill_nearest,
                          local_tile, tile_axes, tile_bilinear, tile_horizon)

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
TILES = {s["id"]: s["tile"] for s in SITES}
SITE = (-89.4398, -137.17)  # Connecting Ridge C1
H0 = 1958.5
RES = 50.0


def synthetic_grid(lat, lon, height_fn, half_m=16000.0, res=RES):
    """Grid covering +-half_m (stereographic) around a site, heights from height_fn(x, y)."""
    cx, cy = (float(v) for v in south_stereo_xy(lat, lon))
    n = int(2 * half_m / res)
    x0, y0 = cx - half_m, cy + half_m
    xc = x0 + (np.arange(n) + 0.5) * res
    yc = y0 - (np.arange(n) + 0.5) * res
    gx, gy = np.meshgrid(xc, yc)
    return Grid(height_fn(gx, gy).astype(np.float64), x0, y0, res, "synthetic")


class TerrainTileTest(unittest.TestCase):
    def test_axes(self):
        xs, ys = tile_axes()
        self.assertEqual(SPACING_M, 78.125)
        self.assertEqual((xs[0], xs[-1], ys[0], ys[-1]), (-HALF_WIDTH_M, HALF_WIDTH_M, HALF_WIDTH_M, -HALF_WIDTH_M))

    def test_flat_dem_gives_exact_curvature_drop(self):
        grid = synthetic_grid(*SITE, lambda x, y: np.full(x.shape, H0))
        z, used = local_tile(*SITE, H0, [grid])
        self.assertTrue(np.all(used == 0))
        r0 = MOON_RADIUS_M + H0
        corner = np.sqrt(r0 ** 2 - 2 * HALF_WIDTH_M ** 2) - r0  # about -57.6 m
        for rc in [(0, 0), (0, SIZE - 1), (SIZE - 1, 0), (SIZE - 1, SIZE - 1)]:
            self.assertAlmostEqual(z[rc], corner, places=6)
        edge = np.sqrt(r0 ** 2 - HALF_WIDTH_M ** 2) - r0
        self.assertAlmostEqual(z[0, SIZE // 2], edge, places=6)
        self.assertAlmostEqual(z[SIZE // 2, SIZE // 2], 0.0, places=9)
        self.assertLess(corner, -57.0)
        self.assertGreater(corner, -58.0)

    def test_spike_at_known_bearing_lands_in_expected_cell(self):
        bearing, dist = 60.0, 6000.0  # north-east of the site
        plat, plon = destination_point(*SITE, bearing, dist)
        px, py = (float(v) for v in south_stereo_xy(plat, plon))

        def bump(x, y):
            return H0 + 800.0 * np.exp(-((x - px) ** 2 + (y - py) ** 2) / (2 * 250.0 ** 2))

        z, _ = local_tile(*SITE, H0, [synthetic_grid(*SITE, bump)])
        r, c = np.unravel_index(int(np.argmax(z)), z.shape)
        # Great-circle distance vs tangent-plane offset differ by < 0.01 m at 6 km.
        want_col = (dist * np.sin(np.radians(bearing)) + HALF_WIDTH_M) / SPACING_M
        want_row = (HALF_WIDTH_M - dist * np.cos(np.radians(bearing))) / SPACING_M
        self.assertLessEqual(abs(c - want_col), 1.0)
        self.assertLessEqual(abs(r - want_row), 1.0)
        self.assertLess(r, SIZE // 2)  # north half
        self.assertGreater(c, SIZE // 2)  # east half
        # 800 m bump, minus the 10.4 m curvature drop at 6 km, minus up to ~5% for the
        # nearest grid cell being up to ~55 m off the bump centre (sigma 250 m).
        self.assertGreater(z[r, c], 750.0)

    def test_downsample_is_area_mean(self):
        data = np.arange(32 * 32, dtype=np.float64).reshape(32, 32)
        data[0, 0] = np.nan
        g = downsample_grid(Grid(data, 0.0, 0.0, 5.0, "t"), 16)
        self.assertEqual(g.shape, (2, 2))
        self.assertEqual(g.res, 80.0)
        self.assertAlmostEqual(g.data[1, 1], float(np.mean(data[16:, 16:])))
        self.assertAlmostEqual(g.data[0, 0], float(np.nanmean(data[:16, :16])))

    def test_encode_round_trip(self):
        z = np.linspace(-3236.84, 202.51, SIZE * SIZE).reshape(SIZE, SIZE)
        buf, zmin, zmax = encode_uint16(z)
        self.assertEqual(len(buf), SIZE * SIZE * 2)
        back = decode_uint16(buf, zmin, zmax)
        self.assertLessEqual(float(np.max(np.abs(back - z))), (zmax - zmin) / 65535.0)

    def test_committed_tiles(self):
        with open(os.path.join(REPO, "src", "data", "horizons.ts")) as f:
            ts = f.read()
        ids = ts.split("HORIZON_SITE_IDS")[1].split("];")[0]
        ids = [s.strip().strip("',") for s in ids.split("\n") if s.strip().startswith("'")]
        self.assertEqual(len(ids), 14)
        out = os.path.join(REPO, "public", "terrain")
        total = 0
        for sid in ids:
            meta_path, bin_path = os.path.join(out, f"{sid}.json"), os.path.join(out, f"{sid}.bin")
            with open(meta_path) as f:
                meta = json.load(f)
            self.assertEqual(set(meta), {"siteId", "size", "spacingM", "halfWidthM", "heightMinM",
                                         "heightMaxM", "source", "grid"})
            self.assertEqual((meta["siteId"], meta["size"], meta["spacingM"], meta["halfWidthM"]),
                             (sid, 257, 78.125, 10000.0))
            with open(bin_path, "rb") as f:
                z = decode_uint16(f.read(), meta["heightMinM"], meta["heightMaxM"])
            self.assertTrue(np.all(np.isfinite(z)))
            self.assertLess(abs(z[128, 128]), 5.0)
            # The 5 m tile is named only where the site has one (no overclaiming).
            self.assertEqual("5 m" in meta["source"], bool(TILES[sid]))  # site sits on its own tangent plane
            total += os.path.getsize(meta_path) + os.path.getsize(bin_path)
        self.assertLessEqual(total, 2.5e6)


def horizon_site_ids():
    with open(os.path.join(REPO, "src", "data", "horizons.ts")) as f:
        ts = f.read()
    ids = ts.split("HORIZON_SITE_IDS")[1].split("];")[0]
    return [s.strip().strip("',") for s in ids.split("\n") if s.strip().startswith("'")]


def load_tile(stem):
    out = os.path.join(REPO, "public", "terrain")
    with open(os.path.join(out, f"{stem}.json")) as f:
        meta = json.load(f)
    with open(os.path.join(out, f"{stem}.bin"), "rb") as f:
        z = decode_uint16(f.read(), meta["heightMinM"], meta["heightMaxM"], meta["size"])
    return meta, z


def load_horizon(sid):
    with open(os.path.join(REPO, "public", "horizons", f"{sid}.json")) as f:
        h = json.load(f)
    az = h["az0"] + np.arange(len(h["elevDeg"])) * h["azStepDeg"]
    return az, np.array(h["elevDeg"]), np.array(h["distKm"])


def near_on_wide_cells(z_near, half_m=9500.0):
    """(wide z, near z box-averaged over ~480 m) at the wide-tile cells with |x|, |y| <= half_m."""
    xs, ys = tile_axes(WIDE_HALF_WIDTH_M)
    cols, rows = np.flatnonzero(np.abs(xs) <= half_m), np.flatnonzero(np.abs(ys) <= half_m)
    x, y = np.meshgrid(xs[cols], ys[rows])
    off = np.linspace(-200.0, 200.0, 6)  # 6 x 6 points across one 480 m cell
    acc = sum(tile_bilinear(z_near, HALF_WIDTH_M, x + dx, y + dy) for dx in off for dy in off)
    return rows, cols, acc / off.size ** 2


class WideTileTest(unittest.TestCase):
    """S15 wide context tiles: +-60 km, 257 x 257, 468.75 m, same format as the near tiles."""

    def test_wide_axes(self):
        xs, ys = tile_axes(WIDE_HALF_WIDTH_M)
        self.assertEqual(WIDE_SPACING_M, 468.75)
        self.assertAlmostEqual(xs[1] - xs[0], 468.75)
        self.assertEqual((xs[0], ys[0], ys[-1]), (-60000.0, 60000.0, -60000.0))

    def test_crop_keeps_pixel_geometry(self):
        grid = synthetic_grid(*SITE, lambda x, y: 0.001 * x - 0.002 * y + 1e-8 * x * y)
        cx, cy = (float(v) for v in south_stereo_xy(*SITE))
        sub = crop_grid(grid, cx - 3000, cx + 2000, cy - 1000, cy + 4000)
        self.assertLess(sub.shape[0] * sub.shape[1], grid.shape[0] * grid.shape[1])
        px = cx + np.linspace(-2900, 1900, 37)
        py = cy + np.linspace(-900, 3900, 37)
        np.testing.assert_allclose(sub.sample_xy(px, py), grid.sample_xy(px, py), atol=1e-9)
        self.assertIsNone(crop_grid(grid, cx + 1e6, cx + 2e6, cy, cy + 1))

    def test_fill_nearest(self):
        h = np.array([[1.0, 2.0, np.nan], [4.0, np.nan, np.nan], [7.0, 8.0, 9.0]])
        out, filled = fill_nearest(h)
        self.assertEqual(int(filled.sum()), 3)
        self.assertEqual(out[0, 2], 2.0)  # nearest finite is (0, 1)
        self.assertEqual(out[1, 2], 9.0)  # nearest finite is (2, 2)
        self.assertTrue(np.all(np.isfinite(out)))

    def test_tile_horizon_flat_moon(self):
        # Flat DEM: the highest-looking point is the nearest one; elevation = atan2(z - eye, s).
        grid = synthetic_grid(*SITE, lambda x, y: np.full(x.shape, H0), half_m=90000.0, res=400.0)
        z, _ = local_tile(*SITE, H0, [grid], WIDE_HALF_WIDTH_M, SIZE, 6)
        el, s = tile_horizon(z, WIDE_HALF_WIDTH_M, [0.0, 90.0, 225.0], 3000.0, 59000.0)
        r0 = MOON_RADIUS_M + H0
        want = np.degrees(np.arctan2(np.sqrt(r0 ** 2 - 3000.0 ** 2) - r0 - 2.0, 3000.0))
        np.testing.assert_allclose(el, want, atol=1e-3)
        np.testing.assert_allclose(s, 3000.0)

    def test_committed_wide_tiles(self):
        ids = horizon_site_ids()
        self.assertEqual(len(ids), 14)
        out = os.path.join(REPO, "public", "terrain")
        total = 0
        for sid in ids:
            meta, z = load_tile(f"{sid}_wide")
            self.assertEqual(set(meta), {"siteId", "size", "spacingM", "halfWidthM", "heightMinM",
                                         "heightMaxM", "source", "grid"})
            self.assertEqual((meta["siteId"], meta["size"], meta["spacingM"], meta["halfWidthM"]),
                             (sid, 257, 468.75, 60000.0))
            self.assertTrue(np.all(np.isfinite(z)))
            self.assertNotIn("PGDA", meta["source"])  # wide tiles use the 80 m / 240 m grids only
            self.assertTrue("nearest valid sample" in meta["source"]
                            or "No sample needed filling" in meta["source"])
            for stem in (f"{sid}_wide.json", f"{sid}_wide.bin"):
                total += os.path.getsize(os.path.join(out, stem))
        self.assertLessEqual(total, 2.5e6)

    def test_wide_centre_matches_near_tile(self):
        """Inside +-9.5 km the wide tile equals the near tile averaged over 480 m cells, within
        the averaging error (mean <= 2 m, RMS <= 8 m on every site), with no shift or flip."""
        for sid in horizon_site_ids():
            _, zn = load_tile(sid)
            _, zw = load_tile(f"{sid}_wide")
            rows, cols, ref = near_on_wide_cells(zn)
            wide = zw[np.ix_(rows, cols)]
            d = wide - ref
            rms = float(np.sqrt(np.mean(d ** 2)))
            with self.subTest(sid=sid):
                self.assertLess(abs(float(d.mean())), 2.0)
                self.assertLess(rms, 8.0)
                # Orientation: the best integer offset (in wide cells) is zero, and every
                # flip or transpose is at least 10x worse.
                best = min(((float(np.sqrt(np.mean((zw[np.ix_(rows + dr, cols + dc)] - ref) ** 2))), dr, dc)
                            for dr in range(-3, 4) for dc in range(-3, 4)))
                self.assertEqual(best[1:], (0, 0))
                for other in (ref[::-1, :], ref[:, ::-1], ref.T):
                    self.assertGreater(float(np.sqrt(np.mean((wide - other) ** 2))), 10.0 * rms)

    def test_ridge_seen_in_both(self):
        """The highest point of the overlap is in the same 480 m cell (within one) in both tiles."""
        for sid in ("connecting_ridge", "a3_malapert"):
            _, zn = load_tile(sid)
            _, zw = load_tile(f"{sid}_wide")
            rows, cols, ref = near_on_wide_cells(zn)
            wide = zw[np.ix_(rows, cols)]
            a = np.unravel_index(int(np.argmax(ref)), ref.shape)
            b = np.unravel_index(int(np.argmax(wide)), wide.shape)
            with self.subTest(sid=sid):
                self.assertLessEqual(max(abs(a[0] - b[0]), abs(a[1] - b[1])), 1)

    def test_wide_horizon_agrees_with_profile(self):
        """Where the LOLA horizon lies within the tile, the tile reproduces it within 0.3 deg."""
        # C1: horizon 10-55 km away, wide tile alone.
        az, el, dist = load_horizon("connecting_ridge")
        _, zw = load_tile("connecting_ridge_wide")
        ok = (dist >= 10.0) & (dist <= 55.0)
        self.assertGreater(int(ok.sum()), 50)
        t, _ = tile_horizon(zw, WIDE_HALF_WIDTH_M, az[ok], 2000.0, 59000.0)
        self.assertLess(float(np.max(np.abs(t - el[ok]))), 0.3)
        # Malapert's horizon is either its own shoulder (< 5 km) or > 100 km away, so check
        # near tile (<= 9.5 km) + wide tile (9.5-59 km) as the 3D view draws them.
        az, el, dist = load_horizon("a3_malapert")
        _, zn = load_tile("a3_malapert")
        _, zw = load_tile("a3_malapert_wide")
        ok = (dist >= 1.0) & (dist < 60.0)
        self.assertGreater(int(ok.sum()), 50)
        a, _ = tile_horizon(zn, HALF_WIDTH_M, az[ok], 100.0, 9500.0, step_m=39.0)
        b, _ = tile_horizon(zw, WIDE_HALF_WIDTH_M, az[ok], 9500.0, 59000.0)
        self.assertLess(float(np.max(np.abs(np.maximum(a, b) - el[ok]))), 0.3)
        # Beyond 2 km (a few 480 m cells from the site) no site's wide tile pokes above its
        # LOLA horizon: it is the same terrain, smoothed (measured max +0.054 deg, Slater).
        for sid in horizon_site_ids():
            az, el, _ = load_horizon(sid)
            _, zw = load_tile(f"{sid}_wide")
            t, _ = tile_horizon(zw, WIDE_HALF_WIDTH_M, az, 2000.0, 59000.0)
            with self.subTest(sid=sid):
                self.assertLess(float(np.max(t - el)), 0.1)


if __name__ == "__main__":
    unittest.main()
