import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { siteGeo as toGeo, getSite, groupSites } from '../../data/sites';
import { useAppState } from '../../state/AppState';
import { useScenarioResult, type ScenarioResult } from '../../state/useScenarioResult';
import { RANGE_DAYS } from '../../state/time';
import { formatIso, type Scenario } from '../../state/url';
import { formatUtc } from '../Metrics/format';
import { subtractWindows, timeToX, windowRect, type Axis } from '../Timeline/geometry';
import type { VisWindow } from '../../astro/types';
import {
  MAX_SCENARIOS,
  MAX_SLIP_DAYS,
  ROW_LABELS,
  ROW_ORDER,
  SCENARIO_LABELS,
  addScenario,
  bestIndices,
  buildColumn,
  clampSlip,
  effectiveStart,
  formatSlip,
  removeScenario,
  shiftSlip,
  withBaseStart,
  withSlip,
  type Cell,
} from './logic';
import './Compare.css';

const DAY_MS = 86_400_000;

function scenarioGeo(sc: Scenario) {
  return typeof sc.site === 'string'
    ? { geo: toGeo(getSite(sc.site) ?? { lat: 0, lon: 0 }), id: sc.site }
    : { geo: { latDeg: sc.site.latDeg, lonDeg: sc.site.lonDeg }, id: null };
}
function scenarioName(sc: Scenario): string {
  return typeof sc.site === 'string' ? (getSite(sc.site)?.name ?? sc.site) : `Custom ${sc.site.latDeg}, ${sc.site.lonDeg}`;
}

/** Runs the shared scenario hook for one scenario and reports the result upward. */
const Runner = memo(function Runner({ index, sc, report }: { index: number; sc: Scenario; report: (i: number, r: ScenarioResult) => void }) {
  const { geo, id } = scenarioGeo(sc);
  const start = useMemo(() => effectiveStart(sc), [sc]);
  const input = useMemo(() => ({ siteGeo: geo, siteId: id, rangeStart: start, t: start }), [geo.latDeg, geo.lonDeg, id, start]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = useScenarioResult(input);
  const retryRef = useRef(r.retry);
  retryRef.current = r.retry;
  useEffect(() => {
    report(index, { ...r, retry: () => retryRef.current() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, report, r.status, r.metrics, r.scan, r.error, r.terrain, r.profile]);
  return null;
});

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const id = useId();
  return (
    <div className="cmp-slip" role="group" aria-labelledby={`${id}-l`}>
      <span id={`${id}-l`} className="cmp-slip-label">
        Slip (days)
      </span>
      <button type="button" aria-label={`${label}: slip minus 1 day`} onClick={() => onChange(value - 1)} disabled={value <= -MAX_SLIP_DAYS}>
        −1
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={-MAX_SLIP_DAYS}
        max={MAX_SLIP_DAYS}
        step={1}
        aria-label={`${label}: slip in days, ${-MAX_SLIP_DAYS} to ${MAX_SLIP_DAYS}`}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isInteger(n) && Math.abs(n) <= MAX_SLIP_DAYS) onChange(n);
        }}
        onBlur={() => setDraft(null)}
      />
      <button type="button" aria-label={`${label}: slip plus 1 day`} onClick={() => onChange(value + 1)} disabled={value >= MAX_SLIP_DAYS}>
        +1
      </button>
      <button type="button" aria-label={`${label}: slip plus 7 days`} onClick={() => onChange(value + 7)} disabled={value >= MAX_SLIP_DAYS}>
        +7
      </button>
      <button type="button" aria-label={`${label}: slip plus 14 days`} onClick={() => onChange(value + 14)} disabled={value >= MAX_SLIP_DAYS}>
        +14
      </button>
    </div>
  );
}

function ScenarioCard({
  index,
  sc,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  sc: Scenario;
  canRemove: boolean;
  onChange: (s: Scenario) => void;
  onRemove: () => void;
}) {
  const label = SCENARIO_LABELS[index];
  const [open, setOpen] = useState(false);
  const uid = useId();
  const start = effectiveStart(sc);
  const groups = useMemo(() => groupSites(), []);
  const siteValue = typeof sc.site === 'string' ? sc.site : '__custom';
  return (
    <li className="cmp-card" data-open={open}>
      <div className="cmp-card-head">
        <h3>
          <span className="cmp-badge" aria-hidden="true">
            {label}
          </span>
          <span className="sr-only">Scenario </span>
          <span className="sr-only">{label}, </span>
          {scenarioName(sc)}
        </h3>
        <button type="button" className="cmp-edit" aria-expanded={open} aria-label={`${open ? 'Done editing' : 'Edit'} scenario ${label}`} aria-controls={`${uid}-body`} onClick={() => setOpen((o) => !o)}>
          {open ? 'Done' : 'Edit'}
        </button>
      </div>
      <p className="cmp-oneline">
        {label} · {scenarioName(sc)} · {start.toISOString().slice(0, 10)} · slip {formatSlip(sc.slipDays)}
      </p>
      <div id={`${uid}-body`} className="cmp-card-body">
        <label className="cmp-field">
          <span>Site</span>
          <select
            value={siteValue}
            onChange={(e) => {
              if (e.target.value !== '__custom') onChange({ ...sc, site: e.target.value });
            }}
          >
            {typeof sc.site !== 'string' && <option value="__custom">{scenarioName(sc)}</option>}
            {groups.map((g) => (
              <optgroup key={g.key} label={g.label}>
                {g.sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="cmp-field">
          <span>Base start (UTC)</span>
          <input
            type="datetime-local"
            value={sc.startISO.slice(0, 16)}
            onChange={(e) => {
              const d = new Date(`${e.target.value}:00Z`);
              if (e.target.value && !Number.isNaN(d.getTime())) onChange(withBaseStart(sc, d));
            }}
          />
        </label>
        <Stepper label={`Scenario ${label}`} value={sc.slipDays} onChange={(n) => onChange(withSlip(sc, n))} />
        <p className="cmp-start">
          Start {formatUtc(start)} (slip {formatSlip(sc.slipDays)})
        </p>
        <button type="button" className="cmp-remove" aria-label={`Remove scenario ${label}`} disabled={!canRemove} onClick={onRemove}>
          Remove
        </button>
      </div>
    </li>
  );
}

function TableView({ scenarios, results }: { scenarios: Scenario[]; results: Record<number, ScenarioResult | undefined> }) {
  const heading = useId();
  const ready = scenarios.map((sc, i) => {
    const r = results[i];
    return r && r.metrics && r.status === 'ready' ? buildColumn(r.metrics, effectiveStart(sc)) : null;
  });
  const allReady = ready.every((c) => c !== null);
  return (
    <section className="cmp-section" aria-labelledby={heading}>
      <h2 id={heading}>Metrics side by side</h2>
      {scenarios.length < 2 && <p className="cmp-note">Add a second scenario to compare.</p>}
      <div className="cmp-scroll" role="group" aria-labelledby={heading} tabIndex={0}>
        <table className="cmp-table">
          <caption className="sr-only">
            Metrics for each scenario. The best value in a row is marked with the word Best. Ties are all marked.
          </caption>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              {scenarios.map((sc, i) => (
                <th scope="col" key={i}>
                  <span className="cmp-badge" aria-hidden="true">
                    {SCENARIO_LABELS[i]}
                  </span>
                  <span className="sr-only">Scenario {SCENARIO_LABELS[i]}, </span> {scenarioName(sc)}
                  <span className="cmp-colstart">{formatIsoDay(effectiveStart(sc))}</span>
                  {results[i]?.status === 'error' && (
                    <span className="cmp-colerr" role="alert">
                      Calculation failed. Use Retry in the rows below.
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROW_ORDER.map((key) => {
              const cells: (Cell | null)[] = ready.map((c) => (c ? c[key] : null));
              const best = allReady ? bestIndices(cells) : new Set<number>();
              return (
                <tr key={key}>
                  <th scope="row">{ROW_LABELS[key]}</th>
                  {scenarios.map((_, i) => {
                    const r = results[i];
                    const c = cells[i];
                    if (!c) {
                      return (
                        <td key={i} className="cmp-pending">
                          {r?.status === 'error' ? (
                            <>
                              <span>Could not calculate. </span>
                              <button type="button" onClick={() => r.retry()}>
                                Retry
                              </button>
                            </>
                          ) : (
                            'Calculating…'
                          )}
                        </td>
                      );
                    }
                    const isBest = best.has(i);
                    return (
                      <td key={i} className={isBest ? 'cmp-best' : undefined}>
                        <span className={isBest ? 'cmp-val cmp-val-best' : 'cmp-val'}>{c.text}</span>
                        {isBest && <span className="cmp-tag">Best</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatIsoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function SunGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="3" fill="currentColor" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1="7" y1="0.8" x2="7" y2="2.6" stroke="currentColor" strokeWidth="1.4" transform={`rotate(${a} 7 7)`} />
      ))}
    </svg>
  );
}
function EarthGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.1 10.9 A5.5 5.5 0 0 1 3.1 3.1 A4 4 0 0 0 3.1 10.9 Z" fill="currentColor" />
    </svg>
  );
}

const AXIS_W = 1000;
const TICKS = [0, 5, 10, 15, 20, 25, 30];

function MiniTimeline({ index, sc, r, uid }: { index: number; sc: Scenario; r: ScenarioResult | undefined; uid: string }) {
  const start = effectiveStart(sc);
  const axis: Axis = { startMs: start.getTime(), spanMs: RANGE_DAYS * DAY_MS, x0: 0, x1: AXIS_W };
  const scan = r?.scan ?? null;
  const m = r?.metrics ?? null;
  const layers: { y: number; solid: boolean; color: string; windows: VisWindow[] }[] = scan
    ? [
        { y: 4, solid: false, color: 'sun', windows: subtractWindows(scan.sunUp, scan.powerOk) },
        { y: 4, solid: true, color: 'sun', windows: scan.powerOk },
        { y: 24, solid: false, color: 'earth', windows: subtractWindows(scan.earthVisible, scan.commsOk) },
        { y: 24, solid: true, color: 'earth', windows: scan.commsOk },
      ]
    : [];
  const summary = m
    ? `Scenario ${SCENARIO_LABELS[index]}, ${scenarioName(sc)}, from ${formatUtc(start)}: Power OK ${Math.round(m.pctPowerOk)} percent, Comms OK ${Math.round(m.pctCommsOk)} percent, both ${Math.round(m.pctBoth)} percent of the 30 days.`
    : `Scenario ${SCENARIO_LABELS[index]}: calculating.`;
  return (
    <li className="cmp-tl-row" aria-busy={r?.status === 'loading'}>
      <span className="cmp-tl-label">
        <span className="cmp-badge" aria-hidden="true">
          {SCENARIO_LABELS[index]}
        </span>
        <span className="sr-only">Scenario {SCENARIO_LABELS[index]}</span>
        <span className="cmp-lanes" aria-hidden="true">
          <span className="cmp-lane-name" style={{ color: 'var(--sun)' }}>
            <SunGlyph /> Sun
          </span>
          <span className="cmp-lane-name" style={{ color: 'var(--earth)' }}>
            <EarthGlyph /> Earth
          </span>
        </span>
      </span>
      <svg viewBox={`0 0 ${AXIS_W} 44`} preserveAspectRatio="none" className="cmp-tl-svg" role="img" aria-label={summary}>
        <defs>
          <pattern id={`${uid}s${index}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="2.5" height="6" fill="var(--sun)" />
          </pattern>
          <pattern id={`${uid}e${index}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="2.5" height="6" fill="var(--earth)" />
          </pattern>
        </defs>
        <rect x={0} y={4} width={AXIS_W} height={12} fill="var(--surface-2)" />
        <rect x={0} y={24} width={AXIS_W} height={12} fill="var(--surface-2)" />
        {layers.map((l, li) =>
          l.windows.map((w, wi) => {
            const rect = windowRect(w, axis, 2);
            const fill = l.solid ? `var(--${l.color})` : `url(#${uid}${l.color === 'sun' ? 's' : 'e'}${index})`;
            return <rect key={`${li}-${wi}`} x={rect.x} y={l.y} width={rect.width} height={12} fill={fill} />;
          }),
        )}
        {TICKS.map((d) => (
          <line key={d} x1={timeToX(axis.startMs + d * DAY_MS, axis)} x2={timeToX(axis.startMs + d * DAY_MS, axis)} y1={0} y2={44} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.5} />
        ))}
      </svg>
      <p className="sr-only">{summary}</p>
    </li>
  );
}

function Timelines({ scenarios, results }: { scenarios: Scenario[]; results: Record<number, ScenarioResult | undefined> }) {
  const heading = useId();
  const uid = useId().replace(/:/g, '');
  return (
    <section className="cmp-section" aria-labelledby={heading}>
      <h2 id={heading}>Stacked mini-timelines</h2>
      <p className="cmp-note">Shared axis: days from each scenario&rsquo;s own start (UTC). Sun lane on top, Earth lane below.</p>
      <ul className="cmp-tl" aria-label="Mini-timelines, one per scenario">
        {scenarios.map((sc, i) => (
          <MiniTimeline key={i} index={i} sc={sc} r={results[i]} uid={uid} />
        ))}
        <li className="cmp-tl-row cmp-tl-axis" aria-hidden="true">
          <span className="cmp-tl-label" />
          <div className="cmp-axis">
            {TICKS.map((d) => (
              <span key={d} style={{ left: `${(d / RANGE_DAYS) * 100}%` }} className={d === 0 ? 'first' : d === RANGE_DAYS ? 'last' : undefined}>
                {d === 0 ? '0 d' : `+${d} d`}
              </span>
            ))}
          </div>
        </li>
      </ul>
      <p className="cmp-legend">
        <span>
          <i className="cmp-sw cmp-sw-solid cmp-sw-sun" /> Solid: Power OK (Sun lane) or Comms OK (Earth lane)
        </span>
        <span>
          <i className="cmp-sw cmp-sw-hatch cmp-sw-sun" /> Hatched Sun: up but below the Power margin
        </span>
        <span>
          <i className="cmp-sw cmp-sw-hatch cmp-sw-earth" /> Hatched Earth: visible but below the Comms margin
        </span>
      </p>
    </section>
  );
}

export function CompareView() {
  const app = useAppState();
  const { scenarios, setScenarios, t, isCustom, site, siteGeo } = app;
  const [results, setResults] = useState<Record<number, ScenarioResult | undefined>>({});
  const [copied, setCopied] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  const fromMain = useCallback(
    (): Scenario => ({
      site: isCustom || !site ? { latDeg: siteGeo.latDeg, lonDeg: siteGeo.lonDeg } : site.id,
      startISO: formatIso(t),
      slipDays: 0,
    }),
    [isCustom, site, siteGeo.latDeg, siteGeo.lonDeg, t],
  );

  // A compare view always has at least one scenario: seed it from the main view.
  useEffect(() => {
    if (scenarios.length === 0) setScenarios([fromMain()]);
  }, [scenarios.length, setScenarios, fromMain]);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(''), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const report = useCallback((i: number, r: ScenarioResult) => setResults((prev) => ({ ...prev, [i]: r })), []);
  const edit = (i: number, s: Scenario) => setScenarios(scenarios.map((x, j) => (j === i ? s : x)));

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied('Link copied');
    } catch {
      setCopied('Could not copy. Copy the address from the browser bar.');
    }
  };

  const atMax = scenarios.length >= MAX_SCENARIOS;
  return (
    <div className="cmp">
      {scenarios.map((sc, i) => (
        <Runner key={i} index={i} sc={sc} report={report} />
      ))}
      <header className="cmp-head">
        <a href="#/" className="cmp-back">
          <span aria-hidden="true">‹ </span>Back to site view
        </a>
        <h1 ref={headingRef} tabIndex={-1}>
          Compare scenarios ({scenarios.length} of {MAX_SCENARIOS})
        </h1>
        <button type="button" className="cmp-copy" onClick={copyLink}>
          Copy link
        </button>
        <span className="cmp-live" role="status" aria-live="polite">
          {copied}
        </span>
      </header>
      <main>
        <section aria-label="Scenarios">
          <ul className="cmp-cards">
            {scenarios.map((sc, i) => (
              <ScenarioCard
                key={i}
                index={i}
                sc={sc}
                canRemove={scenarios.length > 1}
                onChange={(s) => edit(i, s)}
                onRemove={() => setScenarios(removeScenario(scenarios, i))}
              />
            ))}
            <li className="cmp-add">
              <button type="button" disabled={atMax} aria-describedby={atMax ? 'cmp-max' : undefined} onClick={() => setScenarios(addScenario(scenarios, fromMain()))}>
                <span aria-hidden="true">+ </span>Add scenario
              </button>
              {atMax && <p id="cmp-max">Maximum {MAX_SCENARIOS} scenarios</p>}
              {!atMax && <p>Copies the site and time from the main view.</p>}
            </li>
          </ul>
        </section>
        <TableView scenarios={scenarios} results={results} />
        <Timelines scenarios={scenarios} results={results} />
        <p className="cmp-foot">Times are UTC. Planning aid, not flight software. &ldquo;What if we slip&rdquo;: use Slip (days) on a scenario.</p>
      </main>
    </div>
  );
}

export function CompareButton() {
  return (
    <a href="#/compare" className="about-btn cmp-link">
      Compare
    </a>
  );
}

// Re-exported for convenience of the app shell.
export { shiftSlip, clampSlip };
