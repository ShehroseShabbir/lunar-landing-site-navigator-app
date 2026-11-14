"""Download the LOLA inputs into data/raw/ (gitignored).

Usage: python fetch_data.py --raw-dir ../../data/raw [--sites id1,id2]
Files already present with the server's Content-Length are skipped.
"""

import argparse
import os

import requests

from sites import PDS_BASE, PDS_FILES, SITES, tile_filename, tile_url


def fetch(url, dest):
    head = requests.head(url, allow_redirects=True, timeout=60)
    head.raise_for_status()
    size = int(head.headers.get("Content-Length", "-1"))
    if os.path.exists(dest) and os.path.getsize(dest) == size:
        print(f"have  {dest}")
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    part = dest + ".part"
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(part, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
    if size >= 0 and os.path.getsize(part) != size:
        raise IOError(f"{url}: got {os.path.getsize(part)} bytes, expected {size}")
    os.replace(part, dest)
    print(f"fetched {dest}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-dir", required=True)
    ap.add_argument("--sites", default="", help="comma-separated site ids (default: all)")
    args = ap.parse_args()
    wanted = set(filter(None, args.sites.split(",")))
    for name in PDS_FILES:
        fetch(f"{PDS_BASE}/{name}", os.path.join(args.raw_dir, "pds", name))
    for site in SITES:
        if site["tile"] and (not wanted or site["id"] in wanted):
            fetch(tile_url(site["tile"]),
                  os.path.join(args.raw_dir, "pgda", tile_filename(site["tile"])))


if __name__ == "__main__":
    main()
