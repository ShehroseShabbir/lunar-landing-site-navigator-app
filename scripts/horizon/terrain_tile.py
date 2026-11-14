"""Build public/terrain/<siteId>.{json,bin}: a 20 km x 20 km heightmap for the 3D scene (S8),
and with --wide public/terrain/<siteId>_wide.{json,bin}: a 120 km x 120 km context tile (S15).

Usage: python terrain_tile.py --raw-dir ../../data/raw --out ../../public/terrain [--sites id1,id2] [--wide]

Grid: local ENU tangent plane at the site (same basis as geometry.enu_basis and
src/astro); x = east, y = north; row 0 = north edge, col 0 = west edge; 257 x 257
samples at 78.125 m spacing over +-10 km (near tile) or 468.75 m over +-60 km (wide).

Each sample stores z_local, the height of a real DEM surface point above the
site's tangent plane: z = U.(P - O), O = (R + h_site) U, with P the Moon-centred
Cartesian position of the surface point. The point is chosen so that its exact
east/north offsets E.(P - O), N.(P - O) equal the grid (x, y) (orthographic
placement, solved by fixed-point iteration on the height). The curvature drop
(about 57.6 m at the corners, 2.07 km for the wide tile) is therefore included
and the browser draws (x, y, z) as is.

Wide tile heights: LDEM_80S_80M area-averaged 6 x 6 (480 m), else LDEM_75S_240M
area-averaged 2 x 2 (480 m), close to the 468.75 m spacing; the 5 m site tiles
only set the site height (as in the near tile and the horizons). Any sample with
no grid (beyond 75 S) takes the nearest valid sample and `source` says how many.
"""

import argparse
import json
import os

import numpy as np

from dem import Grid, load_geotiff
from geometry import MOON_RADIUS_M, enu_basis, latlon_from_unit, south_stereo_xy
from sites import SITES, tile_filename

SIZE = 257
HALF_WIDTH_M = 10000.0
SPACING_M = 2.0 * HALF_WIDTH_M / (SIZE - 1)  # 78.125 m
DOWNSAMPLE = 16  # 5 m tile -> 80 m by area averaging, close to the 78.125 m spacing
PLACE_ITERS = 4
WIDE_HALF_WIDTH_M = 60000.0
WIDE_SPACING_M = 2.0 * WIDE_HALF_WIDTH_M / (SIZE - 1)  # 468.75 m
WIDE_FACTORS = {"ldem_80s_80m": 6, "ldem_75s_240m": 2}  # both -> 480 m
WIDE_PLACE_ITERS = 6
CROP_MARGIN_M = 3000.0
GRID_TEXT = ("local ENU tangent plane at the site; x = east, y = north; "
             "row 0 = north edge, col 0 = west edge")


def tile_axes(half_width_m=HALF_WIDTH_M, size=SIZE):
    """(x_cols, y_rows): east offsets for col 0..size-1 (west to east) and
    north offsets for row 0..size-1 (north to south)."""
    t = np.linspace(-half_width_m, half_width_m, size)
    return t, t[::-1].copy()


def downsample_grid(grid, factor=DOWNSAMPLE, min_valid=0.5):
    """Area-average a Grid by factor x factor blocks (anchored at its top-left edge).

    A block is NaN unless at least min_valid of its pixels are finite.
    """
    rows, cols = grid.shape
    r, c = rows // factor, cols // factor
    block = np.asarray(grid.data[: r * factor, : c * factor], dtype=np.float64)
    block = block.reshape(r, factor, c, factor)
    finite = np.isfinite(block)
    count = finite.sum(axis=(1, 3))
    total = np.where(finite, block, 0.0).sum(axis=(1, 3))
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = total / count
    mean[count < min_valid * factor * factor] = np.nan
    return Grid(mean * grid.scale, grid.x0, grid.y0, grid.res * factor,
                f"{grid.name}_{grid.res * factor:g}m", valid_below_lat=grid.valid_below_lat)


def crop_grid(grid, x_min, x_max, y_min, y_max):
    """In-memory sub-Grid covering the projected box [x_min, x_max] x [y_min, y_max].

    Reads only the needed window of a memory-mapped raster; returns None if the
    box misses the raster. Pixel geometry and scale are kept exactly.
    """
    rows, cols = grid.shape
    c_lo = max(int(np.floor((x_min - grid.x0) / grid.res)) - 1, 0)
    c_hi = min(int(np.ceil((x_max - grid.x0) / grid.res)) + 1, cols)
    r_lo = max(int(np.floor((grid.y0 - y_max) / grid.res)) - 1, 0)
    r_hi = min(int(np.ceil((grid.y0 - y_min) / grid.res)) + 1, rows)
    if c_hi <= c_lo or r_hi <= r_lo:
        return None
    data = np.array(grid.data[r_lo:r_hi, c_lo:c_hi], dtype=np.float64)
    return Grid(data, grid.x0 + c_lo * grid.res, grid.y0 - r_lo * grid.res, grid.res,
                grid.name, scale=grid.scale, valid_below_lat=grid.valid_below_lat)


def tile_stereo_box(lat_deg, lon_deg, half_width_m, margin_m=CROP_MARGIN_M):
    """Projected (x_min, x_max, y_min, y_max) of the tile footprint plus a margin."""
    east, north, up = enu_basis(lat_deg, lon_deg)
    t = np.linspace(-half_width_m, half_width_m, 65)
    x, y = np.meshgrid(t, t)
    a, b = x / MOON_RADIUS_M, y / MOON_RADIUS_M
    c = np.sqrt(1.0 - a * a - b * b)
    u = a[..., None] * east + b[..., None] * north + c[..., None] * up
    px, py = south_stereo_xy(*latlon_from_unit(u))
    return (float(px.min()) - margin_m, float(px.max()) + margin_m,
            float(py.min()) - margin_m, float(py.max()) + margin_m)


def fill_nearest(h):
    """Copy of h with each NaN replaced by the nearest finite sample (grid index distance),
    and the boolean mask of filled samples."""
    bad = ~np.isfinite(h)
    out = h.copy()
    if not bad.any():
        return out, bad
    good_rc = np.argwhere(~bad)
    if good_rc.size == 0:
        raise ValueError("no valid terrain sample to fill from")
    good_v = h[~bad]
    bad_rc = np.argwhere(bad)
    for i in range(0, len(bad_rc), 64):
        chunk = bad_rc[i:i + 64]
        d2 = ((chunk[:, None, :] - good_rc[None, :, :]) ** 2).sum(axis=-1)
        out[chunk[:, 0], chunk[:, 1]] = good_v[np.argmin(d2, axis=1)]
    return out, bad


def sample_first(grids, lat_deg, lon_deg):
    """Height from the first grid with a finite value at each point.

    Returns (height_m, index_of_grid_used) with index -1 where none covers.
    """
    lat = np.asarray(lat_deg, dtype=float)
    h = np.full(lat.shape, np.nan)
    used = np.full(lat.shape, -1, dtype=int)
    for i, g in enumerate(grids):
        todo = ~np.isfinite(h)
        if not todo.any():
            break
        v = g.sample_latlon(lat[todo], np.asarray(lon_deg, dtype=float)[todo])
        ok = np.isfinite(v)
        idx = np.flatnonzero(todo)[ok]
        h.flat[idx] = v[ok]
        used.flat[idx] = i
    return h, used


def local_tile(lat_deg, lon_deg, site_height_m, grids, half_width_m=HALF_WIDTH_M,
               size=SIZE, iters=PLACE_ITERS, fill=False):
    """z_local (m) on the size x size ENU grid, plus the grid index used per sample.

    fill=True: samples no grid covers take the nearest valid sample's height and
    get index len(grids); otherwise they raise.

    For each (x, y): P = (R + h) u with u = a E + b N + c U, a = x / (R + h),
    b = y / (R + h), c = sqrt(1 - a^2 - b^2), so E.P = x and N.P = y exactly;
    h is the DEM height at u, found by fixed-point iteration from h = h_site.
    z = U.(P - O) = (R + h) c - (R + h_site).
    """
    east, north, up = enu_basis(lat_deg, lon_deg)
    xs, ys = tile_axes(half_width_m, size)
    x, y = np.meshgrid(xs, ys)  # [row, col]
    r0 = MOON_RADIUS_M + site_height_m
    h = np.full(x.shape, float(site_height_m))
    used = None
    for _ in range(iters):
        rad = MOON_RADIUS_M + h
        a, b = x / rad, y / rad
        c = np.sqrt(1.0 - a * a - b * b)
        u = a[..., None] * east + b[..., None] * north + c[..., None] * up
        lat, lon = latlon_from_unit(u)
        h_new, used = sample_first(grids, lat, lon)
        if fill:
            h_new, filled = fill_nearest(h_new)
            used[filled] = len(grids)
        if not np.all(np.isfinite(h_new)):
            raise ValueError(f"{int((~np.isfinite(h_new)).sum())} samples have no terrain height")
        step = float(np.max(np.abs(h_new - h)))
        h = h_new
    if step > 0.5:
        raise ValueError(f"orthographic placement did not converge (last step {step:.2f} m)")
    rad = MOON_RADIUS_M + h
    c = np.sqrt(1.0 - (x / rad) ** 2 - (y / rad) ** 2)
    return rad * c - r0, used


def encode_uint16(z):
    """(bytes, heightMinM, heightMaxM): v = round((z - min) / (max - min) * 65535).

    min/max are rounded outward to 0.01 m so the JSON values decode exactly.
    """
    zmin = float(np.floor(z.min() * 100.0) / 100.0)
    zmax = float(np.ceil(z.max() * 100.0) / 100.0)
    if zmax <= zmin:
        zmax = zmin + 0.01
    v = np.rint((z - zmin) / (zmax - zmin) * 65535.0)
    return np.clip(v, 0, 65535).astype("<u2").tobytes(order="C"), zmin, zmax


def decode_uint16(buf, zmin, zmax, size=SIZE):
    v = np.frombuffer(buf, dtype="<u2").reshape(size, size).astype(float)
    return zmin + v * (zmax - zmin) / 65535.0


def tile_bilinear(z, half_width_m, x_m, y_m):
    """Bilinear z at ENU offsets (x east, y north) on a tile (row 0 north, col 0 west)."""
    size = z.shape[0]
    spacing = 2.0 * half_width_m / (size - 1)
    cf = (np.asarray(x_m, dtype=float) + half_width_m) / spacing
    rf = (half_width_m - np.asarray(y_m, dtype=float)) / spacing
    c0 = np.clip(np.floor(cf).astype(int), 0, size - 2)
    r0 = np.clip(np.floor(rf).astype(int), 0, size - 2)
    fc, fr = cf - c0, rf - r0
    return (z[r0, c0] * (1 - fc) * (1 - fr) + z[r0, c0 + 1] * fc * (1 - fr)
            + z[r0 + 1, c0] * (1 - fc) * fr + z[r0 + 1, c0 + 1] * fc * fr)


def tile_horizon(z, half_width_m, az_deg, min_m, max_m, eye_m=2.0, step_m=None):
    """Horizon (elevation deg, distance m) seen from (0, 0, eye_m) on a tile, per azimuth.

    Exact in the tile's frame: elev = atan2(z - eye, sqrt(x^2 + y^2)), because z_local
    already includes curvature. Marches min_m..max_m (keep max_m inside the tile).
    """
    size = z.shape[0]
    step = step_m or 0.5 * 2.0 * half_width_m / (size - 1)
    s = np.arange(min_m, max_m + 1e-9, step)
    az = np.radians(np.atleast_1d(np.asarray(az_deg, dtype=float)))
    x = np.sin(az)[:, None] * s[None, :]
    y = np.cos(az)[:, None] * s[None, :]
    el = np.degrees(np.arctan2(tile_bilinear(z, half_width_m, x, y) - eye_m, s[None, :]))
    k = np.argmax(el, axis=1)
    return el[np.arange(len(az)), k], s[k]


def _pct(f):
    p = 100.0 * f
    return f"{p:.0f}%" if p >= 1.0 or p == 0.0 else f"{p:.2f}%"


def source_text(site_height_m, names, fractions, has_tile, wide=False):
    used = ", ".join(f"{n} {_pct(f)}" for n, f in zip(names, fractions) if f > 0)
    if wide:
        note = ("Both grids are area-averaged to 480 m first (6 x 6 and 2 x 2 pixels), close to "
                "the 468.75 m spacing; features smaller than that are smoothed out. ")
        if fractions[-1] > 0:
            note += ("Samples beyond 75 S, where no grid covers, take the nearest valid "
                     f"sample's height ({_pct(fractions[-1])} of samples). ")
        else:
            note += "No sample needed filling: all lie inside the grids' coverage. "
    else:
        note = "The 5 m tile is area-averaged to 80 m first. " if has_tile else ""
    return (
        "z_local in metres = height of each LOLA surface point above the site's local tangent "
        "plane, z = U.(P - O) in Moon-centred Cartesian coordinates with O = (1737.4 km + "
        f"{site_height_m:.1f} m) U at the site (the site's terrain height, as in "
        "public/horizons observerHeightM - 2 m), so the curvature drop (about "
        f"{'2.07 km' if wide else '57.6 m'} at the "
        "corners) is included; heightMinM/heightMaxM are the min/max of z_local. Each sample "
        "is the surface point whose exact east/north offsets equal its grid (x, y). Heights, "
        f"bilinear, share of samples: {used}. "
        + note
        + "Uint16 little-endian, row-major, z = heightMinM + v * (heightMaxM - heightMinM) / 65535."
    )


GRID_LABELS = {
    "ldem_80s_80m": "LOLA LDEM_80S_80M (PDS)",
    "ldem_75s_240m": "LOLA LDEM_75S_240M (PDS)",
}


def wide_grids(site, far80, far240):
    """(grids, labels): LDEM_80S_80M then LDEM_75S_240M, cropped to the wide footprint
    and area-averaged to 480 m."""
    box = tile_stereo_box(site["lat"], site["lon"], WIDE_HALF_WIDTH_M)
    grids, labels = [], []
    for g in (far80, far240):
        sub = crop_grid(g, *box)
        if sub is not None:
            grids.append(downsample_grid(sub, WIDE_FACTORS[g.name]))
            labels.append(GRID_LABELS[g.name])
    return grids, labels


def build_site(site, raw_dir, far80, far240, wide=False):
    grids, names = [], []
    finest = far80
    if site["tile"]:
        near = load_geotiff(os.path.join(raw_dir, "pgda", tile_filename(site["tile"])), site["tile"])
        finest = near
        if not wide:
            grids.append(downsample_grid(near))
            names.append(f"LOLA 5 m site DEM {site['tile']} (PGDA, Barker et al. 2021)")
    # Same site height as the near tile and the horizons (finest grid at the site).
    h_site = float(finest.sample_latlon(site["lat"], site["lon"]))
    if not np.isfinite(h_site):
        raise ValueError(f"{site['id']}: no terrain height at the site in {finest.name}")
    if wide:
        grids, names = wide_grids(site, far80, far240)
        z, used = local_tile(site["lat"], site["lon"], h_site, grids, WIDE_HALF_WIDTH_M, SIZE,
                             WIDE_PLACE_ITERS, fill=True)
        names.append("nearest valid sample (fill)")
        half, spacing = WIDE_HALF_WIDTH_M, WIDE_SPACING_M
    else:
        grids += [far80, far240]
        names += [GRID_LABELS[far80.name], GRID_LABELS[far240.name]]
        z, used = local_tile(site["lat"], site["lon"], h_site, grids)
        half, spacing = HALF_WIDTH_M, SPACING_M
    fractions = [float(np.mean(used == i)) for i in range(len(names))]
    buf, zmin, zmax = encode_uint16(z)
    meta = {
        "siteId": site["id"],
        "size": SIZE,
        "spacingM": spacing,
        "halfWidthM": half,
        "heightMinM": zmin,
        "heightMaxM": zmax,
        "source": source_text(h_site, names, fractions, bool(site["tile"]), wide),
        "grid": GRID_TEXT,
    }
    return meta, buf, z, h_site, fractions


def main():
    from build_horizons import load_far

    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--sites", default="")
    ap.add_argument("--wide", action="store_true",
                    help="write <id>_wide.{json,bin}: +-60 km, 468.75 m spacing, 80 m/240 m grids")
    args = ap.parse_args()
    wanted = [s for s in args.sites.split(",") if s]
    by_id = {s["id"]: s for s in SITES}
    unknown = [w for w in wanted if w not in by_id]
    if unknown:
        raise SystemExit(f"unknown site ids: {unknown}")
    todo = [by_id[w] for w in wanted] if wanted else SITES
    far80, far240 = load_far(args.raw_dir)
    os.makedirs(args.out, exist_ok=True)
    for site in todo:
        meta, buf, z, h_site, fractions = build_site(site, args.raw_dir, far80, far240, args.wide)
        stem = f"{site['id']}_wide" if args.wide else site["id"]
        with open(os.path.join(args.out, f"{stem}.bin"), "wb") as f:
            f.write(buf)
        with open(os.path.join(args.out, f"{stem}.json"), "w") as f:
            json.dump(meta, f, separators=(",", ":"))
            f.write("\n")
        r, c = np.unravel_index(int(np.argmax(z)), z.shape)
        xs, ys = tile_axes(meta["halfWidthM"])
        c0 = SIZE // 2
        print(f"{site['id']}: h_site {h_site:.1f} m, z_local min {z.min():.1f} max {z.max():.1f} m, "
              f"highest at row {r} col {c} (x {xs[c] / 1000:.2f} km E, y {ys[r] / 1000:.2f} km N), "
              f"centre z {z[c0, c0]:.2f} m, grids {['%.3f' % f for f in fractions]}", flush=True)


if __name__ == "__main__":
    main()
