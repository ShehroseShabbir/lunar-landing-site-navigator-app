import { useRef, useState } from 'react';
import { getSite } from '../../data/sites';
import { Drawer } from '../Shell/Drawer';
import { SHELL_COPY } from '../Shell/copy';
import './About.css';

/**
 * Terrain numbers quoted in the copy. Taken from plan.md section 5 because S3 was
 * not merged when this was written. Marcus: adjust here after S3 lands.
 */
export const ABOUT_TERRAIN = {
  observerHeightM: 2,
  pgdaTileM: 5,
  gridNearM: 80,
  gridFarM: 240,
  terrainLatLimitDeg: -80,
  maxRangeKm: 300,
  reachStopsAtLatDeg: -75,
} as const;

/** Shape written by the S1b suite to src/data/validation.json. */
interface ValidationFile {
  pointCount?: number;
  sites?: string[];
  perSite?: { site: string; body: string; points: number }[];
  maxElErrDeg?: number;
  maxAzCosElErrDeg?: number;
  fixturesFetchedAt?: string;
}

const found = import.meta.glob('../../data/validation.json', { eager: true }) as Record<
  string,
  { default?: ValidationFile } & ValidationFile
>;
const mod = Object.values(found)[0];
const validation: ValidationFile | undefined = mod ? (mod.default ?? mod) : undefined;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} UTC`;
}

/** Returns the formatted validation tokens, or null if the file or any field is missing. */
export function validationTokens(v: ValidationFile | undefined = validation) {
  if (!v) return null;
  const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  const sunPts = Array.isArray(v.perSite)
    ? v.perSite.filter((p) => p.body === 'sun').reduce((a, p) => a + p.points, 0)
    : 0;
  const pointsPerBody = sunPts > 0 ? sunPts : isNum(v.pointCount) && Array.isArray(v.sites) && v.sites.length > 0 ? v.pointCount / 2 : 0;
  if (
    pointsPerBody <= 0 ||
    !isNum(v.maxElErrDeg) ||
    !isNum(v.maxAzCosElErrDeg) ||
    !Array.isArray(v.sites) ||
    v.sites.length === 0 ||
    !v.fixturesFetchedAt
  )
    return null;
  const generatedAt = fmtDate(v.fixturesFetchedAt);
  if (!generatedAt) return null;
  return {
    pointsPerBody: String(pointsPerBody),
    sites: v.sites.map((id) => getSite(id)?.name ?? id).join(', '),
    generatedAt,
    maxElErrDeg: `${v.maxElErrDeg.toFixed(3)}°`,
    maxAzCosElErrDeg: `${v.maxAzCosElErrDeg.toFixed(3)}°`,
    maxErrDeg: `${Math.max(v.maxElErrDeg, v.maxAzCosElErrDeg).toFixed(3)}°`,
    checks: String(isNum(v.pointCount) ? v.pointCount : pointsPerBody * 2),
  };
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="about-sr"> (opens in a new tab)</span>
    </a>
  );
}

const CREDITS: { item: string; href: string; licence: string }[] = [
  { item: 'React, React DOM', href: 'https://react.dev', licence: 'MIT' },
  { item: 'three.js', href: 'https://threejs.org', licence: 'MIT' },
  { item: 'astronomy-engine (Don Cross)', href: 'https://github.com/cosinekitty/astronomy', licence: 'MIT' },
  {
    item: 'LOLA elevation data, PDS Geosciences Node (80 m and 240 m polar grids)',
    href: 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/',
    licence: 'NASA data, publicly available',
  },
  { item: 'PGDA 5 m site DEMs (Barker et al. 2021)', href: 'https://pgda.gsfc.nasa.gov/products/78', licence: 'NASA data, publicly available' },
  {
    item: 'JPL Horizons (validation only, not called from the app)',
    href: 'https://ssd.jpl.nasa.gov/horizons/',
    licence: 'Public service of NASA/JPL',
  },
  { item: 'NSSDC lunar landing sites', href: 'https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html', licence: 'NASA data, publicly available' },
  { item: 'USGS Gazetteer of Planetary Nomenclature', href: 'https://planetarynames.wr.usgs.gov', licence: 'USGS data, publicly available' },
  { item: 'LROC positions', href: 'https://lroc.im-ldi.com', licence: 'Credit: NASA/GSFC/Arizona State University' },
  { item: 'IBM Plex Sans and Mono (self-hosted)', href: 'https://github.com/IBM/plex', licence: 'SIL Open Font License 1.1' },
  { item: 'Wikipedia (cited for some site coordinates)', href: 'https://en.wikipedia.org', licence: 'CC BY-SA 4.0' },
  {
    item: 'Gläser et al. 2018 (illumination at the south pole)',
    href: 'https://ntrs.nasa.gov/api/citations/20170007365/downloads/20170007365.pdf',
    licence: 'Cited paper, not redistributed',
  },
  {
    item: 'Barker et al. 2021 (method)',
    href: 'https://ntrs.nasa.gov/api/citations/20205009660/downloads/Mike%20Barker_%20Paper_%20Improved%20Lola.pdf',
    licence: 'Cited paper, not redistributed',
  },
  {
    item: 'Mazarico et al. 2011 (illumination method)',
    href: 'https://doi.org/10.1016/j.icarus.2010.10.030',
    licence: 'Cited paper, not redistributed',
  },
];

export interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  /** Element to refocus on close; defaults to the element focused when opened. */
  returnFocusTo?: HTMLElement | null;
}

export function AboutDialog({ open, onClose, returnFocusTo }: AboutDialogProps) {
  const T = ABOUT_TERRAIN;
  const tokens = validationTokens();

  return (
    <Drawer open={open} onClose={onClose} title={SHELL_COPY.aboutTitle} width={440} returnFocusTo={returnFocusTo} className="about-drawer">
      <div className="about-body">
        <h3>What this is</h3>
        <p>
          A planning aid for where the Sun and Earth sit at a lunar site. Not flight software. Built for the NASA Space
          Apps Challenge 2026. Uses NASA data.
        </p>

        <h3>What it calculates</h3>
        <p>Geometry, not watts or link budgets.</p>
        <ul>
          <li><strong>Sun up:</strong> any of the Sun&apos;s disk is above the horizon.</li>
          <li><strong>Power OK:</strong> at least half of it is.</li>
          <li><strong>Earth visible:</strong> any of Earth&apos;s disk is above the horizon.</li>
          <li><strong>Comms OK:</strong> Earth&apos;s centre is at least 0.5° above the horizon.</li>
          <li><strong>Both:</strong> Power OK and Comms OK together.</li>
        </ul>
        <p>
          The horizon is read at each body&apos;s centre azimuth. A 10-minute scan, refined to 1 minute, finds windows.
          Times are UTC.
        </p>

        <h3>How accurate it is</h3>
        {tokens ? (
          <p>
            Computed in your browser with astronomy-engine, no refraction. Positions use the Moon&apos;s mean-Earth (ME)
            frame on a 1737.4 km sphere, with north, east and up taken at the site. Checked against airless JPL
            Horizons output: {tokens.pointsPerBody} times per body at {tokens.sites}, {tokens.generatedAt}. Largest elevation difference:{' '}
            {tokens.maxElErrDeg}. Largest azimuth difference × cos(elevation): {tokens.maxAzCosElErrDeg}.
          </p>
        ) : (
          <p>Computed in your browser with astronomy-engine, no refraction. Positions use the Moon&apos;s mean-Earth (ME) frame on a 1737.4 km sphere, with north, east and up taken at the site. Validation results pending.</p>
        )}
        <p>
          Near the poles the Sun and Earth move slowly in elevation, so a tiny angular error can shift a rise or set
          time by an hour or more.
        </p>

        <h3>Terrain data</h3>
        <p>
          LOLA elevation data gives the horizon: a {T.pgdaTileM} m PGDA tile near the site where one exists, else the{' '}
          {T.gridNearM} m grid, then {T.gridNearM} m and {T.gridFarM} m polar grids farther out. Each site shows its
          near-field resolution. Observer height: {T.observerHeightM} m.
        </p>
        <p>
          Only curated sites at or south of {Math.abs(T.terrainLatLimitDeg)}°S have terrain. All others, custom
          coordinates included, use a flat 0° horizon, as the app states. For custom sites at 80° or beyond: near the
          poles terrain decides sunrise and sunset; this is a smooth-sphere estimate only.
        </p>

        <h3>Where site positions come from</h3>
        <p>
          Sources: NSSDC, USGS Gazetteer, LROC, PGDA, Gläser et al. 2018. A &quot;reference point&quot; is a crater or
          tile centre near a named region, not the region itself.
        </p>

        <h3>Limits</h3>
        <ul>
          <li>Power OK and Comms OK are visibility rules, not engineering margins.</li>
          <li>Terrain exists only for the sites stated above.</li>
          <li>
            The horizon is read at the body centre&apos;s azimuth, so a ridge that clips part of a disk is approximated.
          </li>
          <li>
            Horizon rays run up to {T.maxRangeKm} km and stop where the polar elevation grids end (
            {Math.abs(T.reachStopsAtLatDeg)}°S), so very distant terrain toward the north is not included.
          </li>
          <li>The horizon uses a {T.observerHeightM} m observer height above the elevation data.</li>
        </ul>

        <h3>Credits and licences</h3>
        <p>Not affiliated with or endorsed by NASA. This project uses publicly available NASA data.</p>
        <details>
          <summary>Sources, credits and licences</summary>
          <table>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Terms</th>
              </tr>
            </thead>
            <tbody>
              {CREDITS.map((c) => (
                <tr key={c.href}>
                  <td><Ext href={c.href}>{c.item}</Ext></td>
                  <td>{c.licence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </Drawer>
  );
}

/** Button plus dialog in one: drop it anywhere. */
export function AboutButton() {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="about-btn"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {SHELL_COPY.aboutButton}
      </button>
      <AboutDialog open={open} onClose={() => setOpen(false)} returnFocusTo={btn.current} />
    </>
  );
}
