import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SITES, siteGeo as toGeo, type Site } from '../../data/sites';
import { useAppState } from '../../state/AppState';
import { useScenarioResult, type ScenarioResult } from '../../state/useScenarioResult';
import { formatIso, type Scenario } from '../../state/url';
import { MAX_SCENARIOS, addScenario, effectiveStart, formatDay } from '../Compare/logic';
import { formatLongestDark, formatPercent } from '../Metrics/format';
import { RANK_COPY as C } from './copy';
import {
  defaultDir,
  rankNumbers,
  rankVerdict,
  rankableSites,
  sortRows,
  toRankRow,
  type RankRow,
  type SortDir,
  type SortKey,
} from './logic';
import './Rank.css';

/** Finished rows by (site, range start): reopening the drawer for the same dates is instant. */
const rowCache = new Map<string, RankRow>();
const cacheKey = (siteId: string, start: Date) => `${siteId}|${start.getTime()}`;

/** Runs the shared scenario hook (same worker path and inputs as Compare) for one site and reports its row. */
const Runner = memo(function Runner({
  site,
  start,
  report,
  fail,
}: {
  site: Site;
  start: Date;
  report: (row: RankRow) => void;
  fail: (siteId: string) => void;
}) {
  const geo = useMemo(() => toGeo(site), [site]);
  const input = useMemo(() => ({ siteGeo: geo, siteId: site.id, rangeStart: start, t: start }), [geo, site.id, start]);
  const r: ScenarioResult = useScenarioResult(input);
  useEffect(() => {
    if (r.status === 'error') fail(site.id);
    else if (r.status === 'ready' && r.metrics && r.scan) {
      const row = toRankRow(site, r.metrics);
      rowCache.set(cacheKey(site.id, start), row);
      report(row);
    }
  }, [r.status, r.metrics, r.scan, site, start, report, fail]);
  return null;
});

const COLS: { key: SortKey; label: string; num: boolean }[] = [
  { key: 'name', label: C.cols.name, num: false },
  { key: 'sun', label: C.cols.sun, num: true },
  { key: 'earth', label: C.cols.earth, num: true },
  { key: 'both', label: C.cols.both, num: true },
  { key: 'dark', label: C.cols.dark, num: true },
];

function Arrow({ dir }: { dir: SortDir | null }) {
  return (
    <svg className="rk-arrow" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      {dir === 'asc' && <path d="M5 2 9 8H1z" fill="currentColor" />}
      {dir === 'desc' && <path d="M5 8 1 2h8z" fill="currentColor" />}
      {dir === null && <path d="M5 1 8 4H2zM5 9 2 6h6z" fill="currentColor" opacity="0.5" />}
    </svg>
  );
}

/** Rank content for the drawer. The Drawer supplies the title, close button, focus trap and Esc. */
export function RankView({ onClose }: { onClose: () => void }) {
  const app = useAppState();
  const { rangeStart, site: current, selectSite, scenarios, setScenarios, isCustom, siteGeo, t } = app;
  const sites = useMemo(() => rankableSites(SITES), []);
  const total = sites.length;

  const [rows, setRows] = useState<Record<string, RankRow>>(() => {
    const init: Record<string, RankRow> = {};
    for (const s of rankableSites(SITES)) {
      const hit = rowCache.get(cacheKey(s.id, rangeStart));
      if (hit) init[s.id] = hit;
    }
    return init;
  });
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [retryN, setRetryN] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'both', dir: 'desc' });
  const [addedMsg, setAddedMsg] = useState('');

  const report = useCallback((row: RankRow) => setRows((p) => (p[row.siteId] === row ? p : { ...p, [row.siteId]: row })), []);
  const fail = useCallback((id: string) => setFailed((p) => (p.has(id) ? p : new Set(p).add(id))), []);

  const done = Object.keys(rows).length;
  const finished = done === total;
  const stalled = !finished && failed.size > 0 && done + failed.size >= total;
  const list = useMemo(() => Object.values(rows), [rows]);
  const verdict = useMemo(() => (finished ? rankVerdict(list) : ''), [finished, list]);
  const numbers = useMemo(() => rankNumbers(list), [list]);
  const sorted = useMemo(() => sortRows(list, sort.key, sort.dir), [list, sort]);

  // Polite status: announces the start and the finish only (never the progress count).
  const [status, setStatus] = useState('');
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!finished) setStatus(C.announceStart(total));
  }, [finished, total]);
  useEffect(() => {
    if (finished && verdict) setStatus(C.announceDone(verdict));
  }, [finished, verdict]);

  const full = scenarios.length >= MAX_SCENARIOS;
  const alreadyIn = (id: string) =>
    scenarios.some((sc) => sc.site === id && effectiveStart(sc).getTime() === rangeStart.getTime());
  const addToCompare = (s: Site) => {
    const next: Scenario = { site: s.id, startISO: formatIso(rangeStart), slipDays: 0 };
    // Compare always starts from the main view: seed it first when empty, unless that is the clicked site.
    const mainId = isCustom || !current ? null : current.id;
    const seed: Scenario[] =
      scenarios.length > 0 || mainId === s.id
        ? scenarios
        : [{ site: mainId ?? { latDeg: siteGeo.latDeg, lonDeg: siteGeo.lonDeg }, startISO: formatIso(t), slipDays: 0 }];
    const out = addScenario(seed, next);
    if (out.length === seed.length) return;
    setScenarios(out);
    setAddedMsg(C.added(s.name));
  };

  const toggleSort = (key: SortKey) =>
    setSort((p) => (p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultDir(key) }));

  const rankCell = (n: number | undefined) =>
    n === undefined ? (
      <>
        <span aria-hidden="true">–</span>
        <span className="sr-only">{C.notRanked}</span>
      </>
    ) : (
      n
    );
  const actions = (r: RankRow, s: Site, dup: boolean) => (
    <>
      <button
        type="button"
        aria-label={C.showLabel(r.name)}
        onClick={() => {
          selectSite(r.siteId);
          onClose();
        }}
      >
        {C.show}
      </button>
      <button
        type="button"
        aria-label={dup ? C.alreadyInLabel(r.name) : C.addLabel(r.name)}
        disabled={full || dup}
        aria-describedby={full && !dup ? 'rk-full' : undefined}
        onClick={() => addToCompare(s)}
      >
        {dup ? C.alreadyIn : C.add}
      </button>
    </>
  );

  const pending = sites.filter((s) => !rows[s.id] && !failed.has(s.id));
  return (
    <div className="rk">
      {pending.map((s) => (
        <Runner key={`${s.id}|${retryN}`} site={s} start={rangeStart} report={report} fail={fail} />
      ))}
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      <p className="rk-scope">{C.scope(total, formatDay(rangeStart))}</p>
      <p className="rk-note">{C.why}</p>

      {!finished && !stalled && (
        <p className="rk-progress" aria-hidden="true">
          {C.calculating(done, total)}
        </p>
      )}
      {stalled && (
        <div className="rk-error">
          <p role="alert">{C.failed}</p>
          <button
            type="button"
            onClick={() => {
              setFailed(new Set());
              setRetryN((n) => n + 1);
            }}
          >
            {C.retry}
          </button>
        </div>
      )}
      {verdict && (
        <p className="rk-verdict">
          <b>{verdict}</b>
        </p>
      )}
      {full && (
        <p id="rk-full" className="rk-note">
          {C.full(MAX_SCENARIOS)}
        </p>
      )}

      {list.length > 0 && (
        <>
          <p className="rk-note">{C.legend}</p>
          <label className="rk-sortsel">
            <span>{C.sortLabel}</span>
            <select
              value={sort.key}
              onChange={(e) => {
                const key = e.target.value as SortKey;
                setSort({ key, dir: defaultDir(key) });
              }}
            >
              {(['both', 'sun', 'earth', 'dark', 'name'] as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {C.sortOption[k]}
                </option>
              ))}
            </select>
          </label>
          <div className="rk-scroll rk-wide" role="region" aria-label={C.tableLabel} tabIndex={0}>
            <table className="rk-table">
              <caption className="sr-only">{C.tableLabel}</caption>
              <thead>
                <tr>
                  <th scope="col" className="rk-rank">
                    {C.cols.rank}
                  </th>
                  {COLS.map((c) => {
                    const active = sort.key === c.key;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        className={c.num ? 'rk-num' : 'rk-name'}
                        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        <button type="button" className="rk-sort" onClick={() => toggleSort(c.key)}>
                          <span>{c.label}</span>
                          <Arrow dir={active ? sort.dir : null} />
                        </button>
                      </th>
                    );
                  })}
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const s = sites.find((x) => x.id === r.siteId)!;
                  const isCurrent = !isCustom && current?.id === r.siteId;
                  const dup = alreadyIn(r.siteId);
                  return (
                    <tr key={r.siteId} className={isCurrent ? 'rk-current' : undefined}>
                      <td className="rk-rank">{rankCell(finished ? numbers.get(r.siteId) : undefined)}</td>
                      <th scope="row" className="rk-name">
                        {r.name}
                        {isCurrent && <span className="rk-badge">{C.current}</span>}
                      </th>
                      <td className="rk-num">{formatPercent(r.sunPct)}</td>
                      <td className="rk-num">{formatPercent(r.earthPct)}</td>
                      <td className="rk-num">{formatPercent(r.bothPct)}</td>
                      <td className="rk-num">{formatLongestDark(r.darkHours, r.darkClipped)}</td>
                      <td>
                        <div className="rk-actions">{actions(r, s, dup)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="rk-list" aria-label={C.tableLabel}>
            {sorted.map((r) => {
              const s = sites.find((x) => x.id === r.siteId)!;
              const isCurrent = !isCustom && current?.id === r.siteId;
              const dup = alreadyIn(r.siteId);
              return (
                <li key={r.siteId} className={`rk-item${isCurrent ? ' rk-current' : ''}`}>
                  <p className="rk-item-head">
                    <span className="rk-rank">{rankCell(finished ? numbers.get(r.siteId) : undefined)}</span>
                    <span className="rk-name">{r.name}</span>
                    {isCurrent && <span className="rk-badge">{C.current}</span>}
                  </p>
                  <p className="rk-item-vals">
                    <span>
                      {C.labels.sun} {formatPercent(r.sunPct)}
                    </span>
                    <span>
                      {C.labels.earth} {formatPercent(r.earthPct)}
                    </span>
                    <span>
                      {C.labels.both} {formatPercent(r.bothPct)}
                    </span>
                    <span>
                      {C.labels.dark} {formatLongestDark(r.darkHours, r.darkClipped)}
                    </span>
                  </p>
                  <div className="rk-actions">{actions(r, s, dup)}</div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="rk-added" role="status" aria-live="polite">
        {addedMsg}
      </p>
      <p className="rk-note">{C.foot}</p>
    </div>
  );
}
