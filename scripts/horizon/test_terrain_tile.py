"""Tests for the S8 terrain tiles. Run: python -m unittest discover scripts/horizon"""

import json
import os
import unittest

import numpy as np

from dem import Grid
from sites import SITES
from geometry import MOON_RADIUS_M, destination_point, south_stereo_xy
from terrain_tile import (HALF_WIDTH_M, SIZE, SPACING_M, decode_uint16, downsample_grid,
                          encode_uint16, local_tile, tile_axes)

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


if __name__ == "__main__":
    unittest.main()
