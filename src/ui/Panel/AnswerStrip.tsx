import { useMemo } from 'react';
import { useAppState } from '../../state/AppState';
import { rangeEnd as rangeEndOf } from '../../state/time';
import { useScenarioResult } from '../../state/useScenarioResult';
import { answerComms, answerPower, type AnswerCtx } from '../Metrics/plain';
import { answerKind } from './logic';
import { COPY } from './copy';

/** Phone only: the two plain answers in one compact row each, so the half-open sheet answers without scrolling. */
export function AnswerStrip() {
  const { t, rangeStart, siteGeo } = useAppState();
  const { metrics, scan, profile } = useScenarioResult();
  const ctx: AnswerCtx = useMemo(
    () => ({ site: siteGeo, profile, rangeEnd: rangeEndOf(rangeStart) }),
    [siteGeo, profile, rangeStart],
  );
  if (!metrics) {
    return (
      <p className="answer-strip answer-strip--wait" role="status">
        {COPY.state.calculating}
      </p>
    );
  }
  const rows = [
    { key: 'sun', name: COPY.answers.powerShort, a: answerPower(metrics, t, scan, ctx) },
    { key: 'earth', name: COPY.answers.commsShort, a: answerComms(metrics, t, scan, ctx) },
  ];
  return (
    <div className="answer-strip" role="group" aria-label={COPY.answers.stripLabel}>
      {rows.map((r) => (
        <p key={r.key} className={`answer-strip__row answer--${answerKind(r.a.word)}`}>
          <span className="answer-strip__name">{r.name}</span>
          <strong className="answer-strip__word">{r.a.word}</strong>
          <span className="answer-strip__sentence">{r.a.sentence}</span>
        </p>
      ))}
    </div>
  );
}
