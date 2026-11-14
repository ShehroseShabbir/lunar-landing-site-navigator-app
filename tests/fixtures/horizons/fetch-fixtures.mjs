// Fetches JPL Horizons topocentric (Moon-centred, site height 0) airless az/el for the Sun and Earth.
// Run manually: node tests/fixtures/horizons/fetch-fixtures.mjs   (never part of npm test; never called from the browser)
// Parameters per https://ssd-api.jpl.nasa.gov/doc/horizons.html and the Horizons manual.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const OUT = dirname(fileURLToPath(import.meta.url));
const SITES = [
  { id: 'apollo11', latDeg: 0.67416, lonDeg: 23.47314 },
  { id: 'chandrayaan3', latDeg: -69.3734, lonDeg: 32.3198 },
  { id: 'connecting_ridge', latDeg: -89.4398, lonDeg: -137.17 },
];
const EPOCHS = ['2027-01-15', '2027-05-15', '2027-09-15']; // each: 00:00 UT to +48 h, 6 h step = 9 times
const BODIES = [{ name: 'sun', command: '10' }, { name: 'earth', command: '399' }];
const IM1 = { id: 'im1', latDeg: -80.13, lonDeg: 1.44, start: '2024-02-22 00:00', stop: '2024-02-22 00:01', step: '1 m' };
const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

function addHours(date, h) { return new Date(Date.parse(`${date}T00:00:00Z`) + h * 3600e3); }
function fmt(d) { return d.toISOString().slice(0, 16).replace('T', ' '); }

function buildUrl(site, command, start, stop, step) {
  const p = new URLSearchParams({
    format: 'text',
    COMMAND: `'${command}'`,
    CENTER: "'coord@301'",
    COORD_TYPE: "'GEODETIC'",
    SITE_COORD: `'${site.lonDeg},${site.latDeg},0'`, // E-lon (deg), lat (deg), alt (km)
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'",
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: `'${step}'`,
    QUANTITIES: "'4'", // apparent azimuth and elevation
    APPARENT: "'AIRLESS'",
    ANG_FORMAT: "'DEG'",
    CSV_FORMAT: "'YES'",
    TIME_TYPE: "'UT'",
  });
  return `${API}?${p.toString()}`;
}

async function get(url) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok || !text.includes('$$SOE')) throw new Error(`Horizons error ${res.status}: ${text.slice(0, 400)}`);
  return text;
}

function parse(text, body) {
  const rows = text.split('$$SOE')[1].split('$$EOE')[0].trim().split('\n');
  return rows.map((line) => {
    const f = line.split(',').map((s) => s.trim());
    const m = f[0].match(/^(\d{4})-(\w{3})-(\d{2}) (\d{2}):(\d{2})$/);
    if (!m) throw new Error(`Unparsed row: ${line}`);
    const utc = new Date(Date.UTC(+m[1], MON[m[2]] - 1, +m[3], +m[4], +m[5])).toISOString();
    return { utc, body, azDeg: Number(f[3]), elDeg: Number(f[4]) };
  });
}

function conventionOf(text) {
  const i = text.indexOf("'Azi_(a-app), Elev_(a-app),'");
  const headerLines = text.split('\n').filter((l) => /Atmos refraction|Center pole\/equ|Center radii|Center geodetic/.test(l)).map((l) => l.trim());
  return { quote: text.slice(i, text.indexOf('Computations by', i)).trim(), headerLines };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir(join(OUT, 'raw'), { recursive: true });
const fetchedAt = new Date().toISOString();

for (const site of SITES) {
  const points = [];
  const urls = [];
  let convention;
  for (const epoch of EPOCHS) {
    for (const b of BODIES) {
      const url = buildUrl(site, b.command, fmt(addHours(epoch, 0)), fmt(addHours(epoch, 48)), '6 h');
      const text = await get(url); // sequential, polite
      await writeFile(join(OUT, 'raw', `${site.id}_${epoch}_${b.name}.txt`), `# Request: ${url}\n# Fetched: ${new Date().toISOString()}\n${text}`);
      points.push(...parse(text, b.name));
      urls.push({ epoch, body: b.name, url });
      convention ??= conventionOf(text);
      await sleep(1000);
    }
  }
  const fixture = {
    site: { id: site.id, latDeg: site.latDeg, lonDeg: site.lonDeg, heightM: 0 },
    source: 'JPL Horizons API',
    fetchedAt,
    settings: { center: 'coord@301 (Moon, geodetic, east-positive longitude)', quantities: 4, apparent: 'AIRLESS (no refraction)', timeType: 'UT', stepSize: '6 h', frame: 'Moon MEAN_ME (high precision)' },
    azimuthConvention: convention,
    requests: urls,
    points,
  };
  await writeFile(join(OUT, `${site.id}.json`), JSON.stringify(fixture, null, 1) + '\n');
  console.log(site.id, points.length, 'points');
}

// IM-1 reference check (Sun only)
{
  const url = buildUrl(IM1, '10', IM1.start, IM1.stop, IM1.step);
  const text = await get(url);
  await writeFile(join(OUT, 'raw', 'im1_2024-02-22_sun.txt'), `# Request: ${url}\n# Fetched: ${new Date().toISOString()}\n${text}`);
  const pts = parse(text, 'sun');
  await writeFile(join(OUT, 'im1.json'), JSON.stringify({
    site: { id: IM1.id, latDeg: IM1.latDeg, lonDeg: IM1.lonDeg, heightM: 0 },
    source: 'JPL Horizons API', fetchedAt, requests: [{ body: 'sun', url }],
    researchMdExpected: { azDeg: 30.60, elDeg: 9.65, utc: '2024-02-22T00:00:00.000Z' },
    azimuthConvention: conventionOf(text), points: pts.slice(0, 1),
  }, null, 1) + '\n');
  console.log('im1', pts[0]);
}
