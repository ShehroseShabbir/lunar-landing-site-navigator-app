# Lunar Landing Site Navigator

Pick a lunar site and a date. See where the Sun and Earth sit against that site's real terrain horizon, how long until sunset and Earthset, and what the next 30 days of sunlight and Earth view look like. Compare up to four site and date scenarios side by side, for example "what if launch slips two weeks?".

**Live demo:** https://lunar-landing-site-navigator-alpha.vercel.app

> {SCREENSHOTS: placeholder. To be added after the visual redesign is final.}

Built for the NASA Space Apps Challenge 2026 (Lunar Landing Site Navigator challenge). Not affiliated with or endorsed by NASA.

## The problem

Near the Moon's south pole the Sun stays close to the horizon, so ridges and crater rims decide when a site has light. Earth also drifts in and out of view, which decides when a lander can talk to it directly. Existing tools are good for maps and ephemerides but slow for asking "what happens at this site if the date moves?"

## What it does

- **Site picker:** 35 curated sites (Apollo, Luna, Chang'e, Chandrayaan-3, SLIM, commercial landers, Artemis III candidate regions and south-pole reference points), or your own latitude and longitude.
- **Sun and Earth over the horizon:** for 14 curated south-pole sites (at or south of 80°S) the horizon is the real terrain from LOLA elevation data. Every other site, custom coordinates included, uses a flat 0° horizon, and the app says so.
- **Two simple answers:** "Power OK" (at least half of the Sun's disk is above the horizon) and "Comms OK" (the centre of Earth's disk is at least 0.5° above the horizon). These are geometry rules, not engineering margins.
- **Countdowns:** time to the next sunset, sunrise, Earthset and Earthrise. All times are UTC.
- **30-day windows:** a timeline of when each condition holds, from the chosen start date.
- **Compare:** up to four scenarios, each with its own site, date and slip in days (-60 to +60).
- **3D terrain:** a 20 km by 20 km view of the site's LOLA terrain with the Sun and Earth paths.
- **Time-lapse:** play the sky forward at several speeds.
- **Guided tour:** a short walk-through of the main screen.
- **Share link and CSV:** the URL stores the site, dates and scenarios. A CSV export lists the windows.

## How it works

1. **Positions.** The browser computes the Sun and Earth as seen from the site with [astronomy-engine](https://github.com/cosinekitty/astronomy). It uses the Moon's mean-Earth frame on a 1737.4 km sphere. No server is involved.
2. **Terrain horizon.** A build script (`scripts/horizon`, Python) takes elevation data and casts 720 rays (0.5° apart) out to 300 km from each site, with an observer 2 m above the ground. It stores the highest angle on each ray in `public/horizons/<site>.json`. The data are the 5 m PGDA site tiles near the site where one exists, then the 80 m and 240 m LOLA polar grids. Curvature is included. The method follows Mazarico et al. 2011 and Barker et al. 2021.
3. **Windows.** A 10-minute scan, refined to 1 minute, finds when each body crosses the terrain horizon at its own azimuth.
4. **3D tile.** `scripts/horizon/terrain_tile.py` writes a 257 by 257 height grid per site for the 3D view.

## Validation

The positions were compared with airless output from [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) at Apollo 11, Chandrayaan-3 and Connecting Ridge: 162 points in all (27 for each of the Sun and Earth at each site). The data were fetched on 14 Nov 2026.

| Measure | Result |
|---|---|
| Largest elevation difference | 0.0063° (0.38 arcminutes) |
| Largest azimuth difference times cos(elevation) | 0.0063° |
| Test tolerance | 0.05° |

The figures are in `src/data/validation.json` and the tests are in `src/astro/`. Only positions were compared with Horizons. Terrain horizons were checked against an independent re-run of the ray march, not against another source.

## Accuracy and limits

- **Geometry indices only.** Power OK and Comms OK are visibility rules. They are not power or link budgets.
- **Terrain coverage.** Terrain exists only for the 14 curated sites at or south of 80°S. Elsewhere the horizon is a flat 0°.
- **Terrain resolution.** 5 m only within 5 km of a site where a tile exists, then 80 m and 240 m. Features smaller than a pixel are not resolved.
- **Reach.** Rays stop at 300 km or at 75°S, where the elevation grids end. Distant terrain beyond that is not included. The shortest ray reaches 155 km (IM-1), 220 km (Cabeus B), 271 km (Nobile Rim 2), and 291 km (Mons Mouton).
- **Disk edge.** The horizon is read at the centre of each body, so a ridge that clips part of a disk is approximated.
- **Timing is sensitive near the poles.** The Sun and Earth move slowly in elevation there, so a tiny error in angle can move a rise or set time by an hour or more.
- **No atmosphere.** There is no refraction correction, on purpose.
- **Curated coordinates** for Artemis III regions are reference points (a crater or tile centre), not landing points.

## Run locally

Node.js is required.

```sh
npm ci
npm run dev       # local dev server
npm run check     # typecheck, tests and production build
```

To regenerate the horizon profiles and 3D tiles, follow [`scripts/horizon/README.md`](scripts/horizon/README.md). It needs Python 3.12 or 3.13 and about 0.8 GB of source data, which is not stored in the repo.

## Data sources and credits

| Item | Link | Licence or terms |
|---|---|---|
| LOLA polar elevation grids (80 m and 240 m), LRO LOLA team, NASA PDS Geosciences Node | https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ | Public NASA PDS data. Terms wording not independently checked. |
| High-resolution LOLA topography for south pole sites, 5 m (Barker et al. 2021, PGDA product 78) | https://pgda.gsfc.nasa.gov/products/78 | Public NASA data. Terms wording not independently checked. |
| JPL Horizons (validation only; the app does not call it) | https://ssd.jpl.nasa.gov/horizons/ | Public NASA/JPL service. Terms wording not independently checked. |
| NSSDC lunar landing sites | https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html | NASA data. Terms wording not independently checked. |
| USGS Gazetteer of Planetary Nomenclature | https://planetarynames.wr.usgs.gov | USGS data. Terms wording not independently checked. |
| LROC (Lunar Reconnaissance Orbiter Camera) positions | https://lroc.im-ldi.com | Terms wording not independently checked. |
| Gläser et al. 2018, illumination at the south pole | https://ntrs.nasa.gov/api/citations/20170007365/downloads/20170007365.pdf | Cited paper, not redistributed |
| Barker et al. 2021, Planetary and Space Science 203, 105119 | https://doi.org/10.1016/j.pss.2020.105119 | Cited paper, not redistributed |
| Mazarico et al. 2011, Icarus 211, 1066 | https://doi.org/10.1016/j.icarus.2010.10.030 | Cited paper, not redistributed |
| astronomy-engine (Don Cross) | https://github.com/cosinekitty/astronomy | MIT |
| React and React DOM | https://react.dev | MIT |
| three.js | https://threejs.org | MIT |

Site lists also draw on the Chandrayaan-3 (ISRO) and SLIM (JAXA) landing positions published by the USGS Gazetteer and in public lists of artificial objects on the Moon. Build tools (Vite, TypeScript, Vitest) and the Python packages numpy, rasterio and requests are listed in `package.json` and `scripts/horizon/README.md`.

## Licence

{LICENCE — Director to choose; MIT recommended}
