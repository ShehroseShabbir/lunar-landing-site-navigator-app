"""Build public/terrain/<siteId>.{json,bin}: a 20 km x 20 km heightmap for the 3D scene (S8).

Usage: python terrain_tile.py --raw-dir ../../data/raw --out ../../public/terrain [--sites id1,id2]

Grid: local ENU tangent plane at the site (same basis as geometry.enu_basis and
src/astro); x = east, y = north; row 0 = north edge, col 0 = west edge; 257 x 257
samples at 78.125 m spacing over +-10 km.

Each sample stores z_local, the height of a real DEM surface point above the
site's tangent plane: z = U.(P - O), O = (R + h_site) U, with P the Moon-centred
Cartesian position of the surface point. The point is chosen so that its exact
east/north offsets E.(P - O), N.(P - O) equal the grid (x, y) (orthographic
placement, solved by fixed-point iteration on the height). The curvature drop
(about 57.6 m at the corners) is therefore included and the browser draws
(x, y, z) as is.
"""

import argparse
import json
import os

import numpy as np

from dem import Grid, load_geotiff
from geometry import MOON_RADIUS_M, enu_basis, latlon_from_unit
from sites import SITES, tile_filename

SIZE = 257
HALF_WIDTH_M = 10000.0
SPACING_M = 2.0 * HALF_WIDTH_M / (SIZE - 1)  # 78.125 m
DOWNSAMPLE = 16  # 5 m tile -> 80 m by area averaging, close to the 78.125 m spacing
PLACE_ITERS = 4
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
               size=SIZE, iters=PLACE_ITERS):
    """z_local (m) on the size x size ENU grid, plus the grid index used per sample.

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


def source_text(site_height_m, names, fractions, has_tile):
    used = ", ".join(f"{n} {100.0 * f:.0f}%" for n, f in zip(names, fractions) if f > 0)
    return (
        "z_local in metres = height of each LOLA surface point above the site's local tangent "
        "plane, z = U.(P - O) in Moon-centred Cartesian coordinates with O = (1737.4 km + "
        f"{site_height_m:.1f} m) U at the site (the site's terrain height, as in "
        "public/horizons observerHeightM - 2 m), so the curvature drop (about 57.6 m at the "
        "corners) is included; heightMinM/heightMaxM are the min/max of z_local. Each sample "
        "is the surface point whose exact east/north offsets equal its grid (x, y). Heights, "
        f"bilinear, share of samples: {used}. "
        + ("The 5 m tile is area-averaged to 80 m first. " if has_tile else "")
        + "Uint16 little-endian, row-major, z = heightMinM + v * (heightMaxM - heightMinM) / 65535."
    )


GRID_LABELS = {
    "ldem_80s_80m": "LOLA LDEM_80S_80M (PDS)",
    "ldem_75s_240m": "LOLA LDEM_75S_240M (PDS)",
}


def build_site(site, raw_dir, far80, far240):
    grids, names = [], []
    finest = far80
    if site["tile"]:
        near = load_geotiff(os.path.join(raw_dir, "pgda", tile_filename(site["tile"])), site["tile"])
        finest = near
        grids.append(downsample_grid(near))
        names.append(f"LOLA 5 m site DEM {site['tile']} (PGDA, Barker et al. 2021)")
    grids += [far80, far240]
    names += [GRID_LABELS[far80.name], GRID_LABELS[far240.name]]
    h_site = float(finest.sample_latlon(site["lat"], site["lon"]))
    if not np.isfinite(h_site):
        raise ValueError(f"{site['id']}: no terrain height at the site in {finest.name}")
    z, used = local_tile(site["lat"], site["lon"], h_site, grids)
    fractions = [float(np.mean(used == i)) for i in range(len(grids))]
    buf, zmin, zmax = encode_uint16(z)
    meta = {
        "siteId": site["id"],
        "size": SIZE,
        "spacingM": SPACING_M,
        "halfWidthM": HALF_WIDTH_M,
        "heightMinM": zmin,
        "heightMaxM": zmax,
        "source": source_text(h_site, names, fractions, bool(site["tile"])),
        "grid": GRID_TEXT,
    }
    return meta, buf, z, h_site, fractions


def main():
    from build_horizons import load_far

    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--sites", default="")
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
        meta, buf, z, h_site, fractions = build_site(site, args.raw_dir, far80, far240)
        with open(os.path.join(args.out, f"{site['id']}.bin"), "wb") as f:
            f.write(buf)
        with open(os.path.join(args.out, f"{site['id']}.json"), "w") as f:
            json.dump(meta, f, separators=(",", ":"))
            f.write("\n")
        r, c = np.unravel_index(int(np.argmax(z)), z.shape)
        xs, ys = tile_axes()
        c0 = SIZE // 2
        print(f"{site['id']}: h_site {h_site:.1f} m, z_local min {z.min():.1f} max {z.max():.1f} m, "
              f"highest at row {r} col {c} (x {xs[c] / 1000:.2f} km E, y {ys[r] / 1000:.2f} km N), "
              f"centre z {z[c0, c0]:.2f} m, grids {['%.3f' % f for f in fractions]}", flush=True)


if __name__ == "__main__":
    main()
