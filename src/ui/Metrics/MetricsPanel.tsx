import type { ReactNode } from 'react';
import { useAppState } from '../../state/AppState';
import { useScenarioResult } from '../../state/useScenarioResult';
import { Explain } from '../Explain/Explain';
import { buildView, commsChip, formatUtc, powerChip } from './format';
import type { Chip, Row } from './format';
import { WhySunLow, WhyEarthBobs, WhySunsetSudden } from '../Explain/tour';
import './MetricsPanel.css';

function BoltIcon({ slash }: { slash: boolean }) {
  return (
    <svg className="chip__icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M9 1 3 9h4l-1 6 6-8H8z" fill="currentColor" />
      {slash && <path d="M2 2 14 14" stroke="var(--bad)" strokeWidth="2" />}
    </svg>
  );
}
function AntennaIcon({ slash }: { slash: boolean }) {
  return (
    <svg className="chip__icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M8 7v8M5 15h6" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <circle cx="8" cy="6" r="1.5" fill="currentColor" />
      <path d="M4.5 3.5a5 5 0 0 0 0 5M11.5 3.5a5 5 0 0 1 0 5" stroke="currentColor" strokeWidth="1.4" fill="none" />
      {slash && <path d="M2 2 14 14" stroke="var(--bad)" strokeWidth="2" />}
    </svg>
  );
}

/** Sun: filled disc with rays. Earth: outlined circle with a filled lower-left crescent. Shape plus the text label. */
function SunGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="3.5" fill="var(--sun)" />
      <path
        d="M8 .5v2.5M8 13v2.5M.5 8H3M13 8h2.5M2.7 2.7l1.8 1.8M11.5 11.5l1.8 1.8M13.3 2.7l-1.8 1.8M4.5 11.5l-1.8 1.8"
        stroke="var(--sun)"
        strokeWidth="1.5"
      />
    </svg>
  );
}
function EarthGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6" fill="none" stroke="var(--earth)" strokeWidth="1.5" />
      <path d="M3.8 12.2A6 6 0 0 1 3.8 3.8 4 4 0 0 0 3.8 12.2z" fill="var(--earth)" />
    </svg>
  );
}

function ChipView({ chip, kind, children }: { chip: Chip; kind: 'power' | 'comms'; children?: ReactNode }) {
  return (
    <span className="chip-wrap">
      <span className={`chip chip--${kind} ${chip.ok ? 'chip--ok' : 'chip--off'}`}>
        {kind === 'power' ? <BoltIcon slash={!chip.ok} /> : <AntennaIcon slash={!chip.ok} />}
        <span>{chip.text}</span>
      </span>
      {children}
    </span>
  );
}

function Rows({ rows, extra }: { rows: Row[]; extra?: Record<string, ReactNode> }) {
  return (
    <dl className="metrics__rows">
      {rows.map((r) => (
        <div className="metrics__row" key={r.label}>
          <dt>
            {r.label}
            {extra?.[r.label]}
          </dt>
          <dd>{r.value || ' '}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MetricsPanel() {
  const { t, rangeStart } = useAppState();
  const res = useScenarioResult();
  const shown = res.metrics ? { metrics: res.metrics, scan: res.scan, t } : null;
  const updating = res.status === 'loading' && shown !== null;

  if (res.status === 'error') {
    return (
      <section className="metrics" aria-labelledby="metrics-h">
        <h2 id="metrics-h">Metrics</h2>
        <p role="alert" className="metrics__error">
          Something went wrong calculating this site. Try another time or site.
        </p>
        <button type="button" className="metrics__retry" onClick={() => res.retry()}>
          Retry
        </button>
      </section>
    );
  }

  const header = (
    <div className="metrics__head">
      <h2 id="metrics-h">Metrics</h2>
      {updating && <span className="metrics__updating">Updating…</span>}
      {res.terrain === 'none' && (
        <span className="metrics__badge">
          <span aria-hidden="true" className="metrics__badge-i">
            i
          </span>
          Smooth-Moon horizon, terrain not included
        </span>
      )}
      {res.terrain === 'loading' && <span className="metrics__badge">Loading terrain…</span>}
    </div>
  );

  if (!shown) {
    return (
      <section className="metrics" id="metrics" aria-labelledby="metrics-h" aria-busy="true">
        {header}
        <div className="metrics__skeleton">Calculating…</div>
      </section>
    );
  }

  const view = buildView(shown.metrics, shown.t, shown.scan);
  const m = shown.metrics;
  const horizonWord = res.terrain === 'none' ? 'horizon' : 'terrain';
  return (
    <section
      className={`metrics${updating ? ' metrics--stale' : ''}`}
      id="metrics"
      aria-labelledby="metrics-h"
      aria-busy={updating}
    >
      {header}
      <div className="metrics__chips" role="status">
        <ChipView chip={powerChip(m.sun.powerOk)} kind="power">
          <Explain topic="W5" />
        </ChipView>
        <ChipView chip={commsChip(m.earth.commsOk)} kind="comms">
          <Explain topic="W6" />
        </ChipView>
      </div>

      <h3 className="metrics__body">
        <SunGlyph /> Sun
      </h3>
      <Rows
        rows={view.sun.map((r) =>
          r.label === 'Elevation above terrain' ? { ...r, label: `Elevation above ${horizonWord}` } : r,
        )}
        extra={{
          'Visible disk': <Explain topic="W7" />,
          [`Elevation above ${horizonWord}`]: <WhySunLow />,
          'Sets in': <WhySunsetSudden />,
          'Rises in': <WhySunsetSudden />,
        }}
      />

      <h3 className="metrics__body">
        <EarthGlyph /> Earth
      </h3>
      <Rows
        rows={view.earth.map((r) =>
          r.label === 'Elevation above terrain' ? { ...r, label: `Elevation above ${horizonWord}` } : r,
        )}
        extra={{ [`Elevation above ${horizonWord}`]: <WhyEarthBobs /> }}
      />
      {view.note && <p className="metrics__note">{view.note}</p>}

      <div data-tour="metrics-window">
      <h3 className="metrics__body">30-day window from {formatUtc(rangeStart)}</h3>
      <p className="metrics__hint">
        Operational thresholds: Power OK = Sun at least half visible; Comms OK = Earth centre at least 0.5° above the{' '}
        {horizonWord}. Geometry indices, not watts or link budgets.
      </p>
      <Rows rows={view.tiles} />
      </div>
    </section>
  );
}
