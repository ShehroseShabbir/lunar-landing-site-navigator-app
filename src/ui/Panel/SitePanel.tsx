import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAppState } from '../../state/AppState';
import { rangeEnd as rangeEndOf } from '../../state/time';
import { useScenarioResult } from '../../state/useScenarioResult';
import { NextEvents } from '../Events';
import { answerComms, answerPower, contextSentence, farSideLine, type Answer, type AnswerCtx } from '../Metrics/plain';
import { SitePicker } from '../SitePicker/SitePicker';
import { TimeControl } from '../TimeControl/TimeControl';
import { COPY } from './copy';
import { answerKind, metaTime, viewCaption } from './logic';
import './Panel.css';

export interface SitePanelProps {
  /** `describeNow` caption from the 3D view (B2). Hidden when empty. */
  caption?: string;
  /** Opens the Compare drawer. */
  onCompare: () => void;
  /** Opens the rank drawer. */
  onRank: () => void;
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M9 1 3 9h4l-1 6 6-8H8z" fill="var(--sun)" />
    </svg>
  );
}
function EarthIcon() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6" fill="none" stroke="var(--earth)" strokeWidth="1.5" />
      <path d="M3.8 12.2A6 6 0 0 1 3.8 3.8 4 4 0 0 0 3.8 12.2z" fill="var(--earth)" />
    </svg>
  );
}

function AnswerRow({ icon, question, a }: { icon: ReactNode; question: string; a: Answer }) {
  return (
    <div className={`answer answer--${answerKind(a.word)}`}>
      <p className="answer__q">
        {icon}
        {question}
      </p>
      <p className="answer__word">{a.word}</p>
      <p className="answer__sentence">{a.sentence}</p>
      <p className="answer__precise">{a.precise}</p>
    </div>
  );
}

export function SitePanel({ caption, onCompare, onRank }: SitePanelProps) {
  const { t, rangeStart, siteGeo, siteName, site } = useAppState();
  const res = useScenarioResult();
  const { metrics, scan, profile } = res;
  const updating = res.status === 'loading' && metrics !== null;

  const ctx: AnswerCtx = useMemo(
    () => ({ site: siteGeo, profile, rangeEnd: rangeEndOf(rangeStart) }),
    [siteGeo, profile, rangeStart],
  );
  const power = useMemo(() => (metrics ? answerPower(metrics, t, scan, ctx) : null), [metrics, t, scan, ctx]);
  const comms = useMemo(() => (metrics ? answerComms(metrics, t, scan, ctx) : null), [metrics, t, scan, ctx]);

  const hasTerrain = res.terrain === 'loaded';
  const context = contextSentence(siteName, hasTerrain && site !== null, siteGeo.latDeg);
  const farSide = metrics ? farSideLine(metrics, siteGeo.lonDeg, siteGeo.latDeg) : null;
  // The caption describes the 3D terrain scene: show it only for terrain sites (App clears it in the space view).
  const cap = hasTerrain ? viewCaption(caption) : null;
  const S = COPY.state;

  // One quiet status: speaks when the Sunlight or Earth word changes, or on a commit (site, When? set).
  // Never while the time-lapse plays or the playhead is dragged (no per-tick announcements).
  const [spoken, setSpoken] = useState('');
  const last = useRef<{ words: string; commit: string } | null>(null);
  const words = power && comms ? `${power.word}|${comms.word}` : '';
  const commit = `${site?.id ?? 'custom'}|${rangeStart.getTime()}`;
  useEffect(() => {
    if (!power || !comms) return;
    const prev = last.current;
    last.current = { words, commit };
    if (!prev) return;
    const playing = document.documentElement.dataset.playing === 'true';
    if (playing) return;
    if (prev.words === words && prev.commit === commit) return;
    setSpoken(
      `${siteName}. ${COPY.answers.powerShort}: ${power.word}, ${power.sentence}. ${COPY.answers.commsShort}: ${comms.word}, ${comms.sentence}.`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, commit]);

  let body;
  if (res.status === 'error') {
    body = (
      <div className="answers__state">
        <p role="alert" className="answers__error">
          {S.error}
        </p>
        <button type="button" className="panel-btn" onClick={() => res.retry()}>
          {S.retry}
        </button>
      </div>
    );
  } else if (!metrics || !power || !comms) {
    body = (
      <p className="answers__state" role="status">
        {S.calculating}
      </p>
    );
  } else {
    body = (
      <div className={`answers__body${updating ? ' answers__body--stale' : ''}`}>
        <AnswerRow icon={<BoltIcon />} question={COPY.answers.power} a={power} />
        <AnswerRow icon={<EarthIcon />} question={COPY.answers.comms} a={comms} />
        {context && <p className="answers__context">{context}</p>}
        {farSide && <p className="answers__context">{farSide}</p>}
      </div>
    );
  }

  return (
    <div className="site-panel">
      <SitePicker hasTerrain={hasTerrain} />
      <TimeControl />
      <hr className="panel-rule" />
      <section className="answers" aria-labelledby="answers-h" aria-busy={updating}>
        <div className="answers__head">
          <h2 id="answers-h" className="answers__heading">
            {siteName}
          </h2>
          <p className="answers__meta">{metaTime(t)}</p>
        </div>
        {updating && <p className="answers__updating">{S.updating}</p>}
        {res.terrain === 'loading' && <p className="answers__updating">{S.loadingTerrain}</p>}
        {body}
      </section>
      <button type="button" className="panel-btn panel-btn--wide" onClick={onCompare}>
        {COPY.answers.compare}
      </button>
      <button type="button" className="panel-btn panel-btn--wide" onClick={onRank}>
        {COPY.answers.rank}
      </button>
      {cap && (
        <p className="site-panel__caption">
          <strong>{COPY.answers.view}</strong> {cap}
        </p>
      )}
      <NextEvents />
      <p className="sr-only" role="status">
        {spoken}
      </p>
    </div>
  );
}
