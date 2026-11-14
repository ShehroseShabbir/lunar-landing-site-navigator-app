# Space-view textures (S17)

Builds `public/space/` for the "zoom out to the Moon, Earth and Sun" view: `moon_color_2k.jpg`, `moon_height_1440.png`, `earth_color_2k.jpg` and `manifest.json` (type `SpaceManifest` in `src/state/space.types.ts`). The Director approved the three downloads (DR-HACK-26). Raw files go in `data/raw/space/`, which is gitignored. Never commit them.

## How to rerun

From the repo root on macOS (`sips` does the Earth resize). Python 3.12 with `numpy` and `rasterio`:

```sh
mkdir -p data/raw/space && cd data/raw/space
curl -fsSLO https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg
curl -fsSLO https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_4_uint.tif
curl -fsSLO https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/august/world.topo.bathy.200408.3x5400x2700.jpg
cd ../../..
uv venv --python 3.12 scripts/space/.venv
uv pip install --python scripts/space/.venv/bin/python numpy rasterio
scripts/space/.venv/bin/python -I scripts/space/make_space_textures.py --raw-dir data/raw/space --out public/space
```

Use the `content/dam` URL for Blue Marble. The `dynamicimage` URL for the same file returns a 1280×640 rendition, not the 5400×2700 original. The script stops if the inputs are not 2048×1024, 1440×720 and 5400×2700.

## What it does

- **Moon colour:** the SVS CGI Moon Kit file (LROC WAC mosaic), copied byte for byte.
- **Moon relief:** `ldem_4_uint.tif` is LOLA at 4 px/deg, uint16. SVS 4720 says the values are "half-meters, relative to a radius of 1727400 meters", with "+20,000 (10 km)" added "so that all of the values are positive". So the height above the 1737.4 km sphere is `uint × 0.5 − 10000` m, which gives −8879 to +10504 m. The output is a linear 8-bit grey map at 76 m per level. Its range is in `manifest.json` (`heightMinM`, `heightMaxM`).
- **Why a height map, not a normal map:** a tangent-space normal PNG (R east, G north, B up, slopes from the 1737.4 km radius and 0.25° spacing) is 1.1 MB with no exaggeration and 1.8 MB at ×4. That breaks the 1.5 MB budget. As a JPEG it had a 3° median direction error. The scene makes relief from the height map instead (three.js `bumpMap`, or normals computed at load), and the scene states any exaggeration it uses.
- **Earth colour:** Blue Marble Next Generation with topography and bathymetry, August 2004, resized to 2048×1024 with `sips` at JPEG quality 82. Quality 85 makes the folder 1.53 MB.

## Longitude registration (verified, not assumed)

All three textures are equirectangular, with +90° latitude on the top row and −180° longitude at the left edge (`lonAtLeftEdgeDeg: -180`). The script checks this before it writes anything:

- **ldem_4:** SVS 4720 says the maps are "centered on 0° longitude". The highest and lowest pixels fall at 5.375° N, −158.625° E and 70.375° S, −172.375° E. These match LOLA's known extremes: highest about 5.4° N, 201.4° E; lowest about 70.4° S, 187.7° E (Smith et al. 2010).
- **lroc_color_2k:** SVS 4720 says it is "centered on 0° longitude". With a −180 left edge the maria (Imbrium, Procellarum, Tranquillitatis, Crisium) average 132 grey and the highlands 199. With a 0 left edge the result flips: 202 against 165.
- **Blue Marble:** NASA's pages we could reach do not state the extent, and the BMNG user's manual PDF would not download. The check is empirical. With a −180 left edge, 4 ocean points (Pacific ×2, Atlantic, Indian) come out blue, and the Sahara, central Australia and the US Great Plains come out land-coloured. A 0 left edge would put the Pacific point on the Congo.

## Credits

- Moon: NASA's Scientific Visualization Studio, CGI Moon Kit (https://svs.gsfc.nasa.gov/4720). LROC WAC mosaic by NASA/GSFC/Arizona State University; LOLA elevation by NASA/GSFC.
- Earth: NASA Earth Observatory, Blue Marble Next Generation (https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/). The topography and bathymetry page credits "Imagery by Jesse Allen, NASA's Earth Observatory, using data from the General Bathymetric Chart of the Oceans (GEBCO) produced by the British Oceanographic Data Centre."
