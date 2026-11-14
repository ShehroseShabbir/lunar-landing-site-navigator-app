# Horizon profiles (S3)

Builds `public/horizons/<siteId>.json`: the terrain horizon (elevation angle and distance) in 720 azimuths for each curated site at latitude ≤ −80°. The app loads one with `src/data/horizons.ts`; every other site uses the smooth-Moon horizon.

## How to rerun

From the repo root (Python 3.12 or 3.13; only `numpy`, `rasterio`, `requests`):

```sh
uv venv --python 3.12 scripts/horizon/.venv
uv pip install --python scripts/horizon/.venv/bin/python numpy rasterio requests
cd scripts/horizon
.venv/bin/python fetch_data.py --raw-dir ../../data/raw                 # ~0.8 GB, skips files already present
.venv/bin/python check_grids.py --raw-dir ../../data/raw --tile Site01  # orientation and datum cross-check
.venv/bin/python build_horizons.py --raw-dir ../../data/raw --out ../../public/horizons
cd ../.. && scripts/horizon/.venv/bin/python -m unittest discover scripts/horizon
```

`--sites id1,id2` limits fetching or building to some sites. `build_horizons.py --far-only` is the fallback with no 5 m tiles (80 m near field). Raw files stay in `data/raw/` (gitignored); never commit them. Each site takes a few seconds.

## Method (plan.md §5, DR-HACK-12; after Barker et al. 2021 and Mazarico et al. 2011)

- 720 great-circle rays (0.5° azimuth, clockwise from north) out to 300 km, built in the local ENU basis of research.md §3(a) step 5 on the 1737.4 km sphere. Each sample's lat/lon is projected to south polar stereographic and the height is bilinearly interpolated.
- Step = one pixel of the grid in use: the PGDA 5 m site tile out to min(5 km, tile edge); then LDEM_80S_80M while the sample is at or south of 80°S; then LDEM_75S_240M to 75°S, where the ray stops and its reach is recorded (`minReachKm` is the shortest ray).
- Elevation is exact in Moon-centred Cartesian coordinates, `asin(Û_O·(P−O)/|P−O|)`, so curvature is included. The horizon is the maximum along the ray; `distKm` is the distance to that maximum.
- The observer is 2 m above the terrain height from the finest grid at the site. `observerHeightM` is that eye height in metres relative to the 1737.4 km reference sphere (terrain + 2 m), not the 2 m mast alone.
- Sites with a 5 m tile: Connecting Ridge (Site01), Shackleton rim (Site04), Malapert Massif (Site23), Haworth, Nobile Rim 1 (Site06), Nobile Rim 2 (DM2), de Gerlache Rim 2 (SL2), Connecting Ridge extension (SL3), Peak near Shackleton (Site07). The others (IM-1, IM-2, Mons Mouton, Cabeus B, Slater, Nobile crater) fall outside every tile's bounds and use the 80 m grid as the near field (`nearFieldResM: 80`).
- Projection: `ρ = 2R·tan((90°+lat)/2)`, `x = ρ·sin(lon)`, `y = ρ·cos(lon)`, R = 1737.4 km, as in the GeoTIFF CRS (`+proj=stere +lat_0=-90 +lon_0=0 +R=1737400`) and the forward equations of the PDS `DSMAP_POLAR.CAT`. `check_grids.py` confirms it: over Site01 the 80 m grid matches the 5 m tile with a mean difference of −0.23 m and RMS 1.50 m; flipping either axis gives RMS > 1.7 km.

## Known limits

- Terrain resolution: 5 m only within 5 km where a tile exists, 80 m then 240 m beyond; features smaller than a pixel are not resolved. Barker et al. report 0.30–0.50 m height RMS for the 5 m tiles, with about 90% of pixels interpolated.
- Rays stop at 75°S or 300 km. Terrain beyond that is not included.
- The horizon is sampled every 0.5° in azimuth; the app interpolates linearly between samples.

## Data sources and credit

- LOLA polar gridded data records `LDEM_80S_80M` and `LDEM_75S_240M`, LRO LOLA team (D. E. Smith, GSFC), NASA PDS Geosciences Node: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ . Public NASA PDS data.
- High-resolution LOLA topography for south pole sites (5 m/px), M. K. Barker et al., NASA GSFC PGDA product 78: https://pgda.gsfc.nasa.gov/products/78 . Cite Barker et al. 2021, Planetary & Space Science 203, 105119, https://doi.org/10.1016/j.pss.2020.105119 . Public NASA data.
- Method after Mazarico et al. 2011, Icarus 211, 1066–1081, https://doi.org/10.1016/j.icarus.2010.10.030 .
