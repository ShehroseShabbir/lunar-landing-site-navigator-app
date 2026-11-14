"""Must tests for S3 (plan.md section 5). Run: python -m unittest discover scripts/horizon"""

import json
import os
import unittest

import numpy as np

from dem import Grid
from geometry import (MOON_RADIUS_M, destination_point, elevation_deg, initial_bearing_deg,
                      latlon_from_unit, ray_unit_vectors, south_stereo_latlon, south_stereo_xy,
                      unit_vector)
from horizon import N_AZ, compute_profile
from sites import SITES

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))


def wrap180(d):
    return (d + 180.0) % 360.0 - 180.0


class ProjectionTest(unittest.TestCase):
    def test_site01_centre(self):
        # PGDA Site01 GeoTIFF header: 3200 x 3200 px, 5 m, left -19000 m, top -4000 m.
        grid = Grid(np.zeros((3200, 3200), dtype=np.float32), -19000.0, -4000.0, 5.0, "Site01")
        cx = grid.x0 + grid.shape[1] * grid.res / 2
        cy = grid.y0 - grid.shape[0] * grid.res / 2
        lat, lon = south_stereo_latlon(cx, cy)
        # plan.md quotes (-89.46, 222.5 E), i.e. 2 and 1 decimals.
        self.assertEqual(round(float(lat), 2), -89.46)
        self.assertEqual(round(float(lon) % 360.0, 1), 222.5)
        # research.md section 2b quotes the same centre to 3 / 2 decimals: -89.463, -137.49.
        self.assertEqual(round(float(lat), 3), -89.463)
        self.assertEqual(round(float(lon), 2), -137.49)

    def test_round_trip(self):
        lat = np.array([-80.0, -84.7906, -89.6866, -89.999])
        lon = np.array([1.44, 29.1957, -162.81, 100.0])
        x, y = south_stereo_xy(lat, lon)
        lat2, lon2 = south_stereo_latlon(x, y)
        np.testing.assert_allclose(lat2, lat, atol=1e-9)
        np.testing.assert_allclose(wrap180(lon2 - lon), 0.0, atol=1e-7)

    def test_scale_true_at_pole(self):
        # 1 km from the pole along lon 0 is y = +1 km (Earthward), x = 0.
        lat = -90.0 + np.degrees(1000.0 / MOON_RADIUS_M)
        x, y = south_stereo_xy(lat, 0.0)
        self.assertAlmostEqual(float(x), 0.0, places=6)
        self.assertAlmostEqual(float(y), 1000.0, delta=1e-3)


class RayTest(unittest.TestCase):
    def test_az0_keeps_longitude(self):
        s = np.linspace(0.0, 300000.0, 301)
        pts = ray_unit_vectors(-85.0, 30.0, np.array([0.0]), s)
        lat, lon = latlon_from_unit(pts[0])
        np.testing.assert_allclose(lon, 30.0, atol=1e-9)
        self.assertTrue(np.all(np.diff(lat) > 0))
        self.assertAlmostEqual(float(lat[-1]), -85.0 + np.degrees(300000.0 / MOON_RADIUS_M), places=9)

    def test_az180_reaches_pole(self):
        lat0, lon0 = -89.4398, -137.17
        to_pole = np.radians(90.0 + lat0) * MOON_RADIUS_M
        s = np.array([0.5 * to_pole, to_pole, 1.5 * to_pole])
        pts = ray_unit_vectors(lat0, lon0, np.array([180.0]), s)
        lat, lon = latlon_from_unit(pts[0])
        self.assertAlmostEqual(float(lat[1]), -90.0, places=6)
        self.assertAlmostEqual(float(lon[0]), lon0, places=9)
        self.assertAlmostEqual(float(wrap180(lon[2] - (lon0 + 180.0))), 0.0, places=6)


class SyntheticSpikeTest(unittest.TestCase):
    def test_spike_peak(self):
        site_lat, site_lon = -89.3, 10.0
        spike_lat, spike_lon = destination_point(site_lat, site_lon, 37.0, 30000.0)
        res = 20.0
        sx, sy = south_stereo_xy(site_lat, site_lon)
        px, py = south_stereo_xy(spike_lat, spike_lon)
        x0 = min(float(sx), float(px)) - 2000.0
        y0 = max(float(sy), float(py)) + 2000.0
        ncols = int((max(float(sx), float(px)) + 2000.0 - x0) / res)
        nrows = int((y0 - (min(float(sy), float(py)) - 2000.0)) / res)
        xc = x0 + (np.arange(ncols) + 0.5) * res
        yc = y0 - (np.arange(nrows) + 0.5) * res
        r = np.hypot(xc[None, :] - px, yc[:, None] - py)
        height = 1000.0
        z = np.clip((100.0 - r) / 40.0, 0.0, 1.0) * height  # flat top r <= 60 m, zero beyond 100 m
        grid = Grid(z, x0, y0, res, "synthetic", valid_below_lat=-80.0)
        empty = Grid(np.full((2, 2), np.nan), 0.0, 0.0, 240.0, "empty", valid_below_lat=-75.0)

        prof = compute_profile(site_lat, site_lon, None, grid, empty, max_range_m=40000.0)
        self.assertEqual(prof["elevDeg"].size, N_AZ)
        k = int(np.argmax(prof["elevDeg"]))
        bearing = initial_bearing_deg(site_lat, site_lon, spike_lat, spike_lon)
        observer = (MOON_RADIUS_M + 2.0) * unit_vector(site_lat, site_lon)
        top = (MOON_RADIUS_M + height) * unit_vector(spike_lat, spike_lon)
        expected_el = float(elevation_deg(observer, top))
        self.assertLessEqual(abs(wrap180(prof["azDeg"][k] - bearing)), 0.5)
        self.assertLessEqual(abs(prof["elevDeg"][k] - expected_el), 0.01)
        self.assertAlmostEqual(prof["distKm"][k], 30.0, delta=0.1)
        # Elsewhere the flat sphere falls away below the observer's horizontal.
        others = np.delete(prof["elevDeg"], np.arange(k - 4, k + 5) % N_AZ)
        self.assertTrue(np.all(others < 0.0))


class OutputTest(unittest.TestCase):
    def test_committed_profiles(self):
        out_dir = os.path.join(REPO, "public", "horizons")
        by_id = {s["id"]: s for s in SITES}
        files = sorted(f for f in os.listdir(out_dir) if f.endswith(".json")) if os.path.isdir(out_dir) else []
        for name in files:
            with open(os.path.join(out_dir, name)) as f:
                p = json.load(f)
            sid = name[:-5]
            self.assertEqual(p["siteId"], sid)
            self.assertIn(sid, by_id)
            self.assertLessEqual(by_id[sid]["lat"], -80.0)
            self.assertEqual(p["az0"], 0)
            self.assertEqual(p["azStepDeg"], 0.5)
            self.assertEqual(len(p["elevDeg"]), N_AZ)
            self.assertEqual(len(p["distKm"]), N_AZ)
            self.assertTrue(all(-30.0 < e < 45.0 for e in p["elevDeg"]))
            self.assertTrue(all(0.0 < d <= p["maxRangeKm"] for d in p["distKm"]))
            self.assertGreaterEqual(p["minReachKm"], 150.0)
            self.assertIn(p["nearFieldResM"], (5.0, 80.0))

    def test_sites_match_app_list(self):
        path = os.path.join(REPO, "src", "data", "sites.json")
        if not os.path.exists(path):
            self.skipTest("src/data/sites.json not present on this branch")
        with open(path) as f:
            app = {s["id"]: s for s in json.load(f)}
        ours = {s["id"]: s for s in SITES}
        # Every app site at lat <= -80 has a profile entry with identical coordinates.
        eligible = {i for i, s in app.items() if s["lat"] <= -80.0}
        self.assertLessEqual(eligible, set(ours))
        for sid in set(app) & set(ours):
            self.assertEqual(app[sid]["lat"], ours[sid]["lat"])
            self.assertEqual(app[sid]["lon"], ours[sid]["lon"])


if __name__ == "__main__":
    unittest.main()
