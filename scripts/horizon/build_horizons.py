"""Build public/horizons/<siteId>.json for the curated sites at lat <= -80.

Usage: python build_horizons.py --raw-dir ../../data/raw --out ../../public/horizons
       [--sites id1,id2] [--far-only]
--far-only is fallback (b) of plan.md section 5: 80 m near field, no 5 m tiles.
"""

import argparse
import json
import os

import numpy as np

from dem import load_geotiff, load_pds_img
from horizon import AZ_STEP_DEG, MAST_M, compute_profile
from sites import SITES, tile_filename

SOURCE_NAMES = {
    "ldem_80s_80m": "LOLA LDEM_80S_80M (PDS)",
    "ldem_75s_240m": "LOLA LDEM_75S_240M (PDS)",
}


def load_far(raw_dir):
    pds = os.path.join(raw_dir, "pds")
    far80 = load_pds_img(os.path.join(pds, "ldem_80s_80m.img"),
                         os.path.join(pds, "ldem_80s_80m.lbl"), "ldem_80s_80m", -80.0)
    far240 = load_pds_img(os.path.join(pds, "ldem_75s_240m.img"),
                          os.path.join(pds, "ldem_75s_240m.lbl"), "ldem_75s_240m", -75.0)
    return far80, far240


def source_text(grids_used, tile):
    parts = []
    for g in grids_used:
        if g in SOURCE_NAMES:
            parts.append(SOURCE_NAMES[g])
        else:
            parts.append(f"LOLA 5 m site DEM {tile} (PGDA, Barker et al. 2021) to 5 km")
    return ("; ".join(parts) + ". 720 great-circle rays at 0.5 deg to 300 km, one-pixel steps, "
            f"observer {MAST_M:g} m above terrain; observerHeightM is relative to the 1737.4 km sphere.")


def build_site(site, raw_dir, far80, far240, far_only):
    near = None
    if site["tile"] and not far_only:
        near = load_geotiff(os.path.join(raw_dir, "pgda", tile_filename(site["tile"])), site["tile"])
        if not np.isfinite(near.sample_latlon(site["lat"], site["lon"])):
            raise ValueError(f"{site['id']}: site is not inside tile {site['tile']}")
    prof = compute_profile(site["lat"], site["lon"], near, far80, far240)
    out = {
        "siteId": site["id"],
        "az0": 0,
        "azStepDeg": AZ_STEP_DEG,
        "elevDeg": [round(float(v), 3) for v in prof["elevDeg"]],
        "distKm": [round(float(v), 2) for v in prof["distKm"]],
        "minReachKm": round(prof["minReachKm"], 1),
        "nearFieldResM": prof["nearFieldResM"],
        "observerHeightM": round(prof["observerHeightM"], 1),
        "maxRangeKm": prof["maxRangeKm"],
        "source": source_text(prof["gridsUsed"], site["tile"]),
    }
    h80 = float(far80.sample_latlon(site["lat"], site["lon"]))
    return out, prof, h80


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--sites", default="")
    ap.add_argument("--far-only", action="store_true")
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
        out, prof, h80 = build_site(site, args.raw_dir, far80, far240, args.far_only)
        with open(os.path.join(args.out, f"{site['id']}.json"), "w") as f:
            json.dump(out, f, separators=(",", ":"))
            f.write("\n")
        el = prof["elevDeg"]
        imax, imin = int(np.argmax(el)), int(np.argmin(el))
        print(f"{site['id']}: near {prof['nearFieldResM']:g} m, terrain {prof['terrainHeightM']:.1f} m "
              f"(80 m grid {h80:.1f} m), horizon max {el[imax]:.3f} deg at az {prof['azDeg'][imax]:.1f} "
              f"({prof['distKm'][imax]:.2f} km), min {el[imin]:.3f} deg at az {prof['azDeg'][imin]:.1f} "
              f"({prof['distKm'][imin]:.2f} km), mean {el.mean():.3f}, minReach {prof['minReachKm']:.1f} km, "
              f"grids {','.join(prof['gridsUsed'])}", flush=True)


if __name__ == "__main__":
    main()
