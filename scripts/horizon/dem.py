"""South-polar stereographic DEM grids with bilinear height sampling.

Heights are metres relative to the 1737.4 km reference sphere (LOLA convention).
A Grid stores the left/top edges of the raster in projected metres and the
pixel size; pixel (row, col) has its centre at
x = x0 + (col + 0.5) * res, y = y0 - (row + 0.5) * res.
"""

import os
import re

import numpy as np

from geometry import MOON_RADIUS_M, south_stereo_xy


class Grid:
    def __init__(self, data, x0_m, y0_m, res_m, name, scale=1.0, valid_below_lat=None):
        self.data = data
        self.x0 = float(x0_m)
        self.y0 = float(y0_m)
        self.res = float(res_m)
        self.name = name
        self.scale = float(scale)
        self.valid_below_lat = valid_below_lat  # e.g. -80 for LDEM_80S

    @property
    def shape(self):
        return self.data.shape

    def sample_xy(self, x_m, y_m):
        """Bilinear height (m) at projected points; NaN outside or next to NaN."""
        x = np.asarray(x_m, dtype=float)
        y = np.asarray(y_m, dtype=float)
        rows, cols = self.data.shape
        cf = (x - self.x0) / self.res - 0.5
        rf = (self.y0 - y) / self.res - 0.5
        c0 = np.floor(cf)
        r0 = np.floor(rf)
        inside = (c0 >= 0) & (r0 >= 0) & (c0 + 1 <= cols - 1) & (r0 + 1 <= rows - 1)
        inside &= np.isfinite(cf) & np.isfinite(rf)
        out = np.full(x.shape, np.nan)
        if not inside.any():
            return out
        ci = c0[inside].astype(np.intp)
        ri = r0[inside].astype(np.intp)
        fc = cf[inside] - ci
        fr = rf[inside] - ri
        d = self.data
        z00 = d[ri, ci].astype(float)
        z01 = d[ri, ci + 1].astype(float)
        z10 = d[ri + 1, ci].astype(float)
        z11 = d[ri + 1, ci + 1].astype(float)
        z = (z00 * (1 - fc) * (1 - fr) + z01 * fc * (1 - fr)
             + z10 * (1 - fc) * fr + z11 * fc * fr)
        out[inside] = z * self.scale
        return out

    def sample_latlon(self, lat_deg, lon_deg):
        lat = np.asarray(lat_deg, dtype=float)
        x, y = south_stereo_xy(lat, lon_deg)
        z = self.sample_xy(x, y)
        if self.valid_below_lat is not None:
            z = np.where(lat <= self.valid_below_lat, z, np.nan)
        return z


def _label_value(text, key):
    m = re.search(r"^\s*" + key + r"\s*=\s*(.+?)\s*$", text, re.MULTILINE)
    if not m:
        raise ValueError(f"label key {key} not found")
    return m.group(1).split("<")[0].strip().strip('"')


def load_pds_img(img_path, lbl_path, name, valid_below_lat):
    """Read a LOLA polar LDEM (PDS3 IMG, int16 LSB) as a memory-mapped Grid.

    Pixel equations from DSMAP_POLAR.CAT (forward form, Y Earthward):
    X = (I - N/2 - 0.5) * MAP_SCALE, Y = -(J - N/2 - 0.5) * MAP_SCALE (south),
    with I, J the 1-based sample and line. Height = DN * SCALING_FACTOR.
    """
    with open(lbl_path, "r", encoding="ascii", errors="replace") as f:
        lbl = f.read()
    checks = {
        "MAP_PROJECTION_TYPE": "POLAR STEREOGRAPHIC",
        "CENTER_LATITUDE": "-90",
        "CENTER_LONGITUDE": "0",
        "POSITIVE_LONGITUDE_DIRECTION": "EAST",
        "SAMPLE_TYPE": "LSB_INTEGER",
        "SAMPLE_BITS": "16",
    }
    for key, want in checks.items():
        got = _label_value(lbl, key)
        if got != want:
            raise ValueError(f"{lbl_path}: {key} = {got!r}, expected {want!r}")
    if float(_label_value(lbl, "A_AXIS_RADIUS")) * 1000.0 != MOON_RADIUS_M:
        raise ValueError(f"{lbl_path}: reference radius is not 1737.4 km")
    if float(_label_value(lbl, "OFFSET")) != MOON_RADIUS_M:
        raise ValueError(f"{lbl_path}: height OFFSET is not 1737400 m")
    lines = int(_label_value(lbl, "LINES"))
    samples = int(_label_value(lbl, "LINE_SAMPLES"))
    if lines != samples:
        raise ValueError(f"{lbl_path}: expected a square image")
    res = float(_label_value(lbl, "MAP_SCALE"))
    scale = float(_label_value(lbl, "SCALING_FACTOR"))
    lpo = float(_label_value(lbl, "LINE_PROJECTION_OFFSET"))
    spo = float(_label_value(lbl, "SAMPLE_PROJECTION_OFFSET"))
    if lpo != lines / 2 - 0.5 or spo != samples / 2 - 0.5:
        raise ValueError(f"{lbl_path}: pole is not at the image centre")
    expected = lines * samples * 2
    if os.path.getsize(img_path) != expected:
        raise ValueError(f"{img_path}: size {os.path.getsize(img_path)} != {expected}")
    data = np.memmap(img_path, dtype="<i2", mode="r", shape=(lines, samples))
    half = samples / 2 * res
    return Grid(data, -half, half, res, name, scale=scale, valid_below_lat=valid_below_lat)


def load_geotiff(path, name):
    """Read a PGDA 5 m site tile (float32 GeoTIFF, NaN nodata) as a Grid."""
    import rasterio

    with rasterio.open(path) as ds:
        crs = ds.crs.to_dict() if ds.crs else {}
        want = {"proj": "stere", "lat_0": -90, "lon_0": 0, "R": MOON_RADIUS_M}
        for k, v in want.items():
            if crs.get(k) != v:
                raise ValueError(f"{path}: CRS {k} = {crs.get(k)!r}, expected {v!r}")
        t = ds.transform
        if t.b != 0 or t.d != 0 or t.a != -t.e:
            raise ValueError(f"{path}: unexpected transform {t}")
        data = ds.read(1).astype(np.float32)
        if ds.nodata is not None and not np.isnan(ds.nodata):
            data[data == ds.nodata] = np.nan
        return Grid(data, t.c, t.f, t.a, name)
