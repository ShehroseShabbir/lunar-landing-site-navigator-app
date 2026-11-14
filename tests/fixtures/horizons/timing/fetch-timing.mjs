// Fetches 10-minute JPL Horizons airless az/el + angular diameter for Sun and Earth, 30 days, two sites.
// Run manually: node tests/fixtures/horizons/timing/fetch-timing.mjs  (never part of npm test). Same API settings as ../fetch-fixtures.mjs
// plus QUANTITIES 4,13 (13 = target angular diameter, arcsec). Sequential requests.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const OUT = dirname(fileURLToPath(import.meta.url));
const SITES = [
  { id: 'connecting_ridge', latDeg: -89.4398, lonDeg: -137.17 },
  { id: 'chandrayaan3', latDeg: -69.3734, lonDeg: 32.3198 },
];
const START = '2027-03-01 00:00', STOP = '2027-03-31 00:00', STEP = '10 m';
const BODIES = [{ name: 'sun', command: '10' }, { name: 'earth', command: '399' }];
const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

function buildUrl(site, command) {
  const p = new URLSearchParams({
    format: 'text', COMMAND: `'${command}'`, CENTER: "'coord@301'", COORD_TYPE: "'GEODETIC'",
    SITE_COORD: `'${site.lonDeg},${site.latDeg},0'`, MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'OBSERVER'",
    START_TIME: `'${START}'`, STOP_TIME: `'${STOP}'`, STEP_SIZE: `'${STEP}'`, QUANTITIES: "'4,13'",
    APPARENT: "'AIRLESS'", ANG_FORMAT: "'DEG'", CSV_FORMAT: "'YES'", TIME_TYPE: "'UT'",
  });
  return `${API}?${p.toString()}`;
}
async function get(url) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok || !text.includes('$$SOE')) throw new Error(`Horizons error ${res.status}: ${text.slice(0, 400)}`);
  return text;
}
function parse(text) {
  const header = text.split('\n').find((l) => l.includes('Date__(UT)'));
  const rows = text.split('$$SOE')[1].split('$$EOE')[0].trim().split('\n');
  const out = rows.map((line) => {
    const f = line.split(',').map((s) => s.trim());
    const m = f[0].match(/^(\d{4})-(\w{3})-(\d{2}) (\d{2}):(\d{2})$/);
    if (!m) throw new Error(`Unparsed row: ${line}`);
    return [Date.UTC(+m[1], MON[m[2]] - 1, +m[3], +m[4], +m[5]) / 1000, Number(f[3]), Number(f[4]), Number(f[5])]; // [unix s, az deg, el deg, angDiam arcsec]
  });
  return { header: header.trim(), rows: out };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir(join(OUT, 'raw'), { recursive: true });
const fetchedAt = new Date().toISOString();
for (const site of SITES) {
  const bodies = {}; const requests = []; let header;
  for (const b of BODIES) {
    const url = buildUrl(site, b.command);
    const text = await get(url);
    await writeFile(join(OUT, 'raw', `${site.id}_${b.name}.txt`), `# Request: ${url}\n# Fetched: ${new Date().toISOString()}\n${text}`);
    const p = parse(text); header = p.header; bodies[b.name] = p.rows; requests.push({ body: b.name, url });
    await sleep(1500);
  }
  await writeFile(join(OUT, `${site.id}.json`), JSON.stringify({
    site: { id: site.id, latDeg: site.latDeg, lonDeg: site.lonDeg, heightM: 0 }, source: 'JPL Horizons API', fetchedAt,
    settings: { start: START, stop: STOP, step: STEP, quantities: '4,13', apparent: 'AIRLESS', timeType: 'UT', center: 'coord@301' },
    columns: ['unixSeconds', 'azDeg', 'elDeg', 'angDiamArcsec'], header, requests, sun: bodies.sun, earth: bodies.earth,
  }) + '\n');
  console.log(site.id, bodies.sun.length, bodies.earth.length, header);
}
