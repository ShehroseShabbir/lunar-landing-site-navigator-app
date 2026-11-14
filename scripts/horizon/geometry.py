"""Sphere geometry for horizon ray-marching (Moon, ME frame, R = 1737.4 km).

Degrees at the boundary, radians inside. Longitude is east-positive.
Body-fixed axes: +X at (0 N, 0 E), +Y at (0 N, 90 E), +Z north pole.
The local ENU basis is the one in prep/research.md section 3(a) step 5:
U = sphere normal, E = unit(north x U), N = U x E.
"""

import numpy as np

MOON_RADIUS_M = 1737400.0
_NORTH = np.array([0.0, 0.0, 1.0])


def unit_vector(lat_deg, lon_deg):
    """Unit vector(s) on the sphere, shape (..., 3)."""
    lat = np.radians(np.asarray(lat_deg, dtype=float))
    lon = np.radians(np.asarray(lon_deg, dtype=float))
    c = np.cos(lat)
    return np.stack([c * np.cos(lon), c * np.sin(lon), np.sin(lat)], axis=-1)


def latlon_from_unit(v):
    """(lat_deg, lon_deg) of unit vector(s) of shape (..., 3); lon in -180..180."""
    v = np.asarray(v, dtype=float)
    lat = np.degrees(np.arcsin(np.clip(v[..., 2], -1.0, 1.0)))
    lon = np.degrees(np.arctan2(v[..., 1], v[..., 0]))
    return lat, lon


def enu_basis(lat_deg, lon_deg):
    """(E, N, U) unit vectors for a site. Undefined exactly at a pole."""
    if abs(lat_deg) >= 90.0:
        raise ValueError("site exactly at a pole has no east direction")
    up = unit_vector(lat_deg, lon_deg)
    east = np.cross(_NORTH, up)
    east /= np.linalg.norm(east)
    north = np.cross(up, east)
    return east, north, up


def ray_unit_vectors(lat_deg, lon_deg, az_deg, dist_m):
    """Great-circle ray samples from a site.

    az_deg: shape (A,), clockwise from north. dist_m: shape (S,), arc length on
    the reference sphere. Returns unit vectors of shape (A, S, 3):
    p = cos(t) U + sin(t) (cos(az) N + sin(az) E), t = dist / R.
    """
    east, north, up = enu_basis(lat_deg, lon_deg)
    az = np.radians(np.asarray(az_deg, dtype=float))
    t = np.asarray(dist_m, dtype=float) / MOON_RADIUS_M
    heading = np.cos(az)[:, None] * north + np.sin(az)[:, None] * east  # (A, 3)
    return (np.cos(t)[None, :, None] * up[None, None, :]
            + np.sin(t)[None, :, None] * heading[:, None, :])


def south_stereo_xy(lat_deg, lon_deg):
    """South polar stereographic on the 1737.4 km sphere, true scale at the pole.

    rho = 2R tan((90 + lat)/2), x = rho sin(lon), y = rho cos(lon) (metres).
    Same convention as the PGDA GeoTIFFs (+proj=stere +lat_0=-90 +lon_0=0
    +R=1737400) and the PDS LOLA polar products (DSMAP_POLAR.CAT, Y Earthward).
    """
    lat = np.radians(np.asarray(lat_deg, dtype=float))
    lon = np.radians(np.asarray(lon_deg, dtype=float))
    rho = 2.0 * MOON_RADIUS_M * np.tan((np.pi / 2 + lat) / 2.0)
    return rho * np.sin(lon), rho * np.cos(lon)


def south_stereo_latlon(x_m, y_m):
    """Inverse of south_stereo_xy. Returns (lat_deg, lon_deg)."""
    x = np.asarray(x_m, dtype=float)
    y = np.asarray(y_m, dtype=float)
    rho = np.hypot(x, y)
    lat = -90.0 + np.degrees(2.0 * np.arctan(rho / (2.0 * MOON_RADIUS_M)))
    lon = np.degrees(np.arctan2(x, y))
    return lat, lon


def elevation_deg(observer_xyz, points_xyz):
    """Exact elevation of points above the observer's local horizontal plane.

    elev = asin(U_O . (P - O) / |P - O|), U_O = unit(O). Curvature is included
    because P and O are Moon-centred Cartesian positions.
    """
    o = np.asarray(observer_xyz, dtype=float)
    up = o / np.linalg.norm(o)
    d = np.asarray(points_xyz, dtype=float) - o
    return np.degrees(np.arcsin(np.clip((d @ up) / np.linalg.norm(d, axis=-1), -1.0, 1.0)))


def initial_bearing_deg(lat1_deg, lon1_deg, lat2_deg, lon2_deg):
    """Great-circle initial bearing (spherical trig), clockwise from north, 0..360."""
    p1, p2 = np.radians(lat1_deg), np.radians(lat2_deg)
    dl = np.radians(lon2_deg - lon1_deg)
    y = np.sin(dl) * np.cos(p2)
    x = np.cos(p1) * np.sin(p2) - np.sin(p1) * np.cos(p2) * np.cos(dl)
    return float(np.degrees(np.arctan2(y, x)) % 360.0)


def destination_point(lat_deg, lon_deg, bearing_deg, dist_m):
    """Great-circle destination (spherical trig), returns (lat_deg, lon_deg)."""
    p1, l1 = np.radians(lat_deg), np.radians(lon_deg)
    b = np.radians(bearing_deg)
    t = dist_m / MOON_RADIUS_M
    p2 = np.arcsin(np.sin(p1) * np.cos(t) + np.cos(p1) * np.sin(t) * np.cos(b))
    l2 = l1 + np.arctan2(np.sin(b) * np.sin(t) * np.cos(p1),
                         np.cos(t) - np.sin(p1) * np.sin(p2))
    lon = (np.degrees(l2) + 180.0) % 360.0 - 180.0
    return float(np.degrees(p2)), float(lon)
