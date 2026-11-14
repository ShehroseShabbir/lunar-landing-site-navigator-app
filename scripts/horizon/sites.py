"""Curated sites eligible for terrain profiles (lat <= -80), from
prep/research.md section 2d (ids and coordinates copied unchanged).

tile = PGDA 5 m site DEM (product 78) whose extent contains the site, checked
against each tile's GeoTIFF bounds; None means no 5 m tile covers the site and
the 80 m grid is the near field.
"""

PGDA_BASE = "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp"
PDS_BASE = ("https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/"
            "lrolol_1xxx/data/lola_gdr/polar/img")
PDS_FILES = ["ldem_80s_80m.lbl", "ldem_80s_80m.img", "ldem_75s_240m.lbl", "ldem_75s_240m.img"]

# Demo sites first (plan.md section 5), then the rest.
SITES = [
    {"id": "connecting_ridge", "lat": -89.4398, "lon": -137.17, "tile": "Site01"},
    {"id": "shackleton_rim", "lat": -89.6866, "lon": -162.81, "tile": "Site04"},
    {"id": "a3_malapert", "lat": -85.995, "lon": -0.236, "tile": "Site23"},
    {"id": "im2", "lat": -84.7906, "lon": 29.1957, "tile": None},
    {"id": "im1", "lat": -80.13, "lon": 1.44, "tile": None},
    {"id": "a3_haworth", "lat": -86.764, "lon": -22.777, "tile": "Haworth"},
    {"id": "a3_nobile1", "lat": -85.438, "lon": 37.367, "tile": "Site06"},
    {"id": "a3_nobile2", "lat": -83.954, "lon": 58.822, "tile": "DM2"},
    {"id": "a3_monsmouton", "lat": -84.6, "lon": 31.0, "tile": None},
    {"id": "a3_cabeusb", "lat": -82.259, "lon": -54.585, "tile": None},
    {"id": "a3_slater", "lat": -88.079, "lon": 111.288, "tile": None},
    {"id": "connecting_ridge_ext", "lat": -89.032, "lon": -102.0, "tile": "SL3"},
    {"id": "peak_near_shackleton", "lat": -88.811, "lon": 123.69, "tile": "Site07"},
    {"id": "griffin1", "lat": -85.275, "lon": 53.273, "tile": None},
]

DEMO_IDS = ["connecting_ridge", "shackleton_rim", "a3_malapert", "im2"]


def tile_filename(tile):
    return f"{tile}_final_adj_5mpp_surf.tif"


def tile_url(tile):
    return f"{PGDA_BASE}/{tile}/{tile_filename(tile)}"
