import { useId } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../../state/AppState';
import { useScenarioResult } from '../../state/useScenarioResult';
import { formatIso } from '../../state/url';
import { MetricsPanel } from '../Metrics/MetricsPanel';
import { PlaybackControls } from '../Playback';
import { ShareControls } from '../Share';
import { SkyView } from '../SkyView/SkyView';
import { ExplainAccordion, explainItems } from '../Explain';
import { validationTokens } from '../About/About';
import { DETAILS_COPY as C } from './copy';
import './PlannerDetails.css';

const HOUR_MS = 3_600_000;
const STEPS = [
  { id: '-1d', text: C.stepMinusDay, ms: -24 * HOUR_MS },
  { id: '-1h', text: C.stepMinusHour, ms: -HOUR_MS },
  { id: '+1h', text: C.stepPlusHour, ms: HOUR_MS },
  { id: '+1d', text: C.stepPlusDay, ms: 24 * HOUR_MS },
] as const;

/** Default time steps (±1 h, ±1 d). B3's `TimeSteps` can replace it through the `timeSteps` prop. */
function DefaultTimeSteps() {
  const { stepT } = useAppState();
  return (
    <div className="pd-steps" role="group" aria-label={C.stepsLabel}>
      <span className="pd-small" aria-hidden="true">
        {C.stepsLabel}
      </span>
      {STEPS.map((s) => (
        <button key={s.id} type="button" aria-label={C.stepLabels[s.id]} onClick={() => stepT(s.ms)}>
          {s.text}
        </button>
      ))}
    </div>
  );
}

function WindowStart() {
  const { rangeStart, setRangeStart } = useAppState();
  const id = useId();
  return (
    <div className="pd-field">
      <label htmlFor={id}>{C.windowStart}</label>
      <input
        id={id}
        type="datetime-local"
        aria-describedby={`${id}-h`}
        value={formatIso(rangeStart).slice(0, 16)}
        onChange={(e) => {
          const d = new Date(`${e.target.value}:00Z`);
          if (e.target.value && !Number.isNaN(d.getTime())) setRangeStart(d);
        }}
      />
      <span id={`${id}-h`} className="pd-small">
        {C.windowStartHelp}
      </span>
    </div>
  );
}

export interface PlannerDetailsProps {
  /** B3's `PlannerRows` (exact angles and countdowns). Defaults to the existing MetricsPanel. */
  plannerRows?: ReactNode;
  /** B3's `TimeSteps`. Defaults to a built-in ±1 h / ±1 d row. */
  timeSteps?: ReactNode;
  /** Playback speed control. Defaults to PlaybackControls. */
  playback?: ReactNode;
}

const WHY_IDS = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'] as const;

/** Content of the "Planner details" tab (frame A2). The panel (B3) supplies the tab strip and the 440 px width. */
export function PlannerDetails({ plannerRows, timeSteps, playback }: PlannerDetailsProps = {}) {
  const { siteGeo, siteName, t } = useAppState();
  const { profile, terrain } = useScenarioResult();
  const validation = validationTokens();
  const items = [
    ...explainItems([...WHY_IDS]),
    {
      id: 'validation',
      title: C.validationTitle,
      body: validation ? `${C.validationAnswer(validation)} ${C.validation(validation)}` : C.validationPending,
    },
  ];
  return (
    <div className="pd">
      <section className="pd-block" aria-label={C.rowsFallbackTitle}>
        {plannerRows ?? <MetricsPanel />}
      </section>

      <section className="pd-block">
        <SkyView site={siteGeo} siteName={siteName} profile={profile} t={t} mode="panel" headingLevel={3} />
      </section>

      <section className="pd-block" aria-labelledby="pd-settings">
        <h3 id="pd-settings">{C.settingsTitle}</h3>
        <WindowStart />
        {timeSteps ?? <DefaultTimeSteps />}
        <div className="pd-playback" role="group" aria-label={C.playbackTitle}>
          {playback ?? <PlaybackControls />}
        </div>
        <p className="pd-small">{C.skyAnglesNote}</p>
      </section>

      <section className="pd-block pd-notes" aria-label="Notes">
        <p className="pd-small">{C.thresholdNote}</p>
        {terrain === 'none' ? <p className="pd-small">{C.smoothMoonNote}</p> : <p className="pd-small">{C.terrainNote}</p>}
        <p className="pd-small">{C.starNote}</p>
      </section>

      <section className="pd-block" aria-labelledby="pd-why">
        <h3 id="pd-why" className="sr-only">
          {C.whyLabel}
        </h3>
        <ExplainAccordion items={items} label={C.whyLabel} />
      </section>

      <section className="pd-block pd-share" aria-label={C.shareTitle}>
        <ShareControls />
      </section>
    </div>
  );
}
