"""Build the S17 space-view textures and manifest (public/space/).

Inputs (data/raw/space/, gitignored, see README.md for the download commands):
  lroc_color_2k.jpg                        NASA SVS CGI Moon Kit (svs.gsfc.nasa.gov/4720), 2048x1024
  ldem_4_uint.tif                          same kit, LOLA heights, 4 px/deg, uint16 half-metres, +20000 offset
  world.topo.bathy.200408.3x5400x2700.jpg  NASA Earth Observatory Blue Marble NG, August 2004

Outputs (public/space/):
  moon_color_2k.jpg    the SVS file, byte for byte
  moon_height_1440.png 8-bit linear height map from the LOLA heights (see height_map for why not normals)
  earth_color_2k.jpg   Blue Marble resized to 2048x1024 with macOS sips, JPEG quality 82
  manifest.json        SpaceManifest (src/state/space.types.ts)

Every texture is equirectangular, latitude +90 at the top row. The script checks the longitude
registration against known features before it writes anything, and stops if a check fails.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import rasterio

MOON_RADIUS_M = 1_737_400.0  # LOLA / ME reference sphere, same as src/astro MOON_RADIUS_KM
# SVS 4720: "unsigned 16-bit TIFFs in half-meters, relative to a radius of 1727400 meters";
# "the source data was offset by +20,000 (10 km) so that all of the values are positive".
LDEM_SCALE_M = 0.5
LDEM_OFFSET_M = -10_000.0  # height above 1737.4 km = uint * 0.5 - 10000
EARTH_JPEG_QUALITY = '82'  # keeps public/space under 1.5 MB (q85 gives 581 KB, q82 497 KB)

MOON_CREDIT = "NASA's Scientific Visualization Studio (CGI Moon Kit; LROC WAC mosaic ASU, LOLA)"
EARTH_CREDIT = 'NASA Earth Observatory (Blue Marble Next Generation)'
SVS_BASE = 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/'
BMNG_URL = (
    'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/'
    'bmng-topography-bathymetry/august/world.topo.bathy.200408.3x5400x2700.jpg'
)
LON_LEFT_DEG = -180.0


def pixel(img: np.ndarray, lat: float, lon: float, left: float = LON_LEFT_DEG) -> np.ndarray:
    """Value at (lat, lon) for an equirectangular image whose left edge is `left` and top is +90."""
    h, w = img.shape[-2:]
    r = min(h - 1, int((90.0 - lat) / 180.0 * h))
    c = int(((lon - left) % 360.0) / 360.0 * w) % w
    return img[..., r, c]


def box_mean(img: np.ndarray, lat0: float, lat1: float, lon0: float, lon1: float, left: float) -> float:
    vals = [pixel(img, la, lo, left) for la in np.arange(lat0, lat1, 0.5) for lo in np.arange(lon0, lon1, 0.5)]
    return float(np.mean(vals))


def check_ldem(h_m: np.ndarray) -> None:
    """LOLA extremes (Smith et al. 2010): highest ~5.4 N 201.4 E, lowest ~70.4 S 187.7 E (= -172.3)."""
    rows, cols = h_m.shape
    for fn, lat_ref, lon_ref in ((np.argmax, 5.4, -158.6), (np.argmin, -70.4, -172.3)):
        r, c = np.unravel_index(fn(h_m), h_m.shape)
        lat = 90.0 - (r + 0.5) * 180.0 / rows
        lon = LON_LEFT_DEG + (c + 0.5) * 360.0 / cols
        print(f'  ldem {fn.__name__}: {h_m[r, c]:.0f} m at {lat:.3f}, {lon:.3f} (ref {lat_ref}, {lon_ref})')
        assert abs(lat - lat_ref) < 1.0 and abs(lon - lon_ref) < 1.0, 'ldem registration check failed'
    assert -9_500 < h_m.min() < -8_000 and 10_000 < h_m.max() < 11_000, 'ldem height range unexpected'


def check_moon_color(rgb: np.ndarray) -> None:
    """Maria must be darker than highlands with left = -180; the swapped hypothesis (left = 0) must fail."""
    grey = rgb.mean(axis=0)
    maria = [(25, 40, -25, -5), (0, 30, -60, -45), (0, 15, 20, 35), (12, 22, 52, 65)]
    highlands = [(-30, -10, 0, 20), (-10, 20, 150, 179), (-10, 20, -179, -150)]
    for left in (LON_LEFT_DEG, 0.0):
        m = np.mean([box_mean(grey, *b, left) for b in maria])
        hl = np.mean([box_mean(grey, *b, left) for b in highlands])
        print(f'  moon colour, left {left:+.0f}: maria {m:.1f}, highlands {hl:.1f}')
        if left == LON_LEFT_DEG:
            assert m < hl - 40, 'moon colour registration check failed'
        else:
            assert m > hl, 'moon colour alternative hypothesis unexpectedly passes'


def check_earth_color(rgb: np.ndarray) -> None:
    """Ocean points must be blue-dominant and desert points red-dominant with left = -180."""
    oceans = [(0, -160), (-20, -120), (0, -30), (-20, 80)]
    land = [(23, 10), (-25, 133), (40, -100)]  # Sahara, central Australia, US Great Plains
    for lat, lon in oceans:
        r, g, b = (int(v) for v in pixel(rgb, lat, lon))
        assert b > r and b > 15 and r < 40, f'ocean check failed at {lat},{lon}: {r},{g},{b}'
    for lat, lon in land:
        r, g, b = (int(v) for v in pixel(rgb, lat, lon))
        assert r > b, f'land check failed at {lat},{lon}: {r},{g},{b}'
    print('  earth colour: 4 ocean and 3 land points as expected with left -180')


def height_map(h_m: np.ndarray) -> tuple[np.ndarray, float, float]:
    """8-bit linear height map: value v -> height = min + v / 255 * (max - min) metres above 1737.4 km.

    A tangent-space normal map was built first and dropped: as a lossless PNG it is 1.1 MB even
    without exaggeration (1.8 MB at x4), over the 1.5 MB budget for public/space, and JPEG
    normals had a 3 deg median direction error. The height map is 0.49 MB; the scene turns it
    into relief (three.js bumpMap or normals computed at load).
    """
    lo = float(np.floor(h_m.min()))
    hi = float(np.ceil(h_m.max()))
    v = np.clip(np.rint((h_m - lo) / (hi - lo) * 255.0), 0, 255).astype(np.uint8)
    step = (hi - lo) / 255.0
    print(f'  height map: {lo:.0f} .. {hi:.0f} m, {step:.1f} m per level')
    return v, lo, hi


def write_png(path: Path, band: np.ndarray) -> None:
    h, w = band.shape
    with rasterio.open(path, 'w', driver='PNG', width=w, height=h, count=1, dtype='uint8', ZLEVEL=9) as dst:
        dst.write(band, 1)
    aux = path.with_name(path.name + '.aux.xml')
    if aux.exists():
        aux.unlink()


def texture(file: str, w: int, h: int, kind: str, credit: str, url: str, **extra: object) -> dict:
    d = {
        'file': file,
        'width': w,
        'height': h,
        'lonAtLeftEdgeDeg': LON_LEFT_DEG,
        'kind': kind,
        'credit': credit,
        'sourceUrl': url,
    }
    d.update(extra)
    return d


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--raw-dir', type=Path, required=True)
    ap.add_argument('--out', type=Path, required=True)
    a = ap.parse_args()
    raw: Path = a.raw_dir
    out: Path = a.out
    out.mkdir(parents=True, exist_ok=True)

    with rasterio.open(raw / 'ldem_4_uint.tif') as ds:
        u = ds.read(1)
    assert u.dtype == np.uint16 and u.shape == (720, 1440), (u.dtype, u.shape)
    h_m = u.astype(np.float64) * LDEM_SCALE_M + LDEM_OFFSET_M
    with rasterio.open(raw / 'lroc_color_2k.jpg') as ds:
        moon_rgb = ds.read()
    with rasterio.open(raw / 'world.topo.bathy.200408.3x5400x2700.jpg') as ds:
        earth_rgb = ds.read()
    assert moon_rgb.shape == (3, 1024, 2048), moon_rgb.shape
    assert earth_rgb.shape == (3, 2700, 5400), earth_rgb.shape

    print('registration checks')
    check_ldem(h_m)
    check_moon_color(moon_rgb)
    check_earth_color(earth_rgb)

    print('writing textures')
    shutil.copyfile(raw / 'lroc_color_2k.jpg', out / 'moon_color_2k.jpg')
    hmap, h_lo, h_hi = height_map(h_m)
    write_png(out / 'moon_height_1440.png', hmap)
    subprocess.run(
        ['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', EARTH_JPEG_QUALITY, '-z', '1024', '2048',
         str(raw / 'world.topo.bathy.200408.3x5400x2700.jpg'), '--out', str(out / 'earth_color_2k.jpg')],
        check=True,
        stdout=subprocess.DEVNULL,
    )

    manifest = {
        'moonColor': texture('moon_color_2k.jpg', 2048, 1024, 'color', MOON_CREDIT, SVS_BASE + 'lroc_color_2k.jpg'),
        'moonNormal': texture(
            'moon_height_1440.png', 1440, 720, 'height', MOON_CREDIT, SVS_BASE + 'ldem_4_uint.tif',
            heightMinM=h_lo,
            heightMaxM=h_hi,
            encoding='8-bit grey, linear: height above the 1737.4 km sphere = heightMinM + v / 255 * (heightMaxM - heightMinM)',
        ),
        'earthColor': texture('earth_color_2k.jpg', 2048, 1024, 'color', EARTH_CREDIT, BMNG_URL),
        'radiiKm': {'moon': 1737.4, 'earth': 6371.0, 'sun': 695700},
    }
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    for p in sorted(out.iterdir()):
        print(f'  {p.name}: {p.stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    main()
