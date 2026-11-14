"""Cross-check the PDS grid orientation and height datum against a PGDA tile.

Samples the 80 m LDEM and a 5 m tile at the same projected points (a lattice
inside the tile) under four axis hypotheses for the PDS grid. The chosen
convention (as read in dem.py) must give by far the smallest RMS difference.
Usage: python check_grids.py --raw-dir ../../data/raw --tile Site01
"""

import argparse
import os

import numpy as np

from build_horizons import load_far
from dem import load_geotiff
from sites import tile_filename


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-dir", required=True)
    ap.add_argument("--tile", default="Site01")
    args = ap.parse_args()
    far80, far240 = load_far(args.raw_dir)
    tile = load_geotiff(os.path.join(args.raw_dir, "pgda", tile_filename(args.tile)), args.tile)
    rows, cols = tile.shape
    xs = tile.x0 + (np.linspace(0.05, 0.95, 60) * cols) * tile.res
    ys = tile.y0 - (np.linspace(0.05, 0.95, 60) * rows) * tile.res
    x, y = np.meshgrid(xs, ys)
    zt = tile.sample_xy(x, y)
    for label, fx, fy in [("as read (x, y)", 1, 1), ("x flipped", -1, 1),
                          ("y flipped", 1, -1), ("both flipped", -1, -1)]:
        for g in (far80, far240):
            zg = g.sample_xy(fx * x, fy * y)
            ok = np.isfinite(zt) & np.isfinite(zg)
            d = zg[ok] - zt[ok]
            print(f"{args.tile} vs {g.name} {label:15s}: n={ok.sum()} mean diff {d.mean():8.2f} m, "
                  f"RMS {np.sqrt((d ** 2).mean()):8.2f} m, corr {np.corrcoef(zg[ok], zt[ok])[0, 1]:.4f}")


if __name__ == "__main__":
    main()
