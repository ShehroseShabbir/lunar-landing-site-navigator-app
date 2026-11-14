import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAppState } from '../../state/AppState';
import type { TriggerMatch, TriggerRule } from '../../state/events.types';
import { formatIso } from '../../state/url';
import { SCENARIO_LABELS, addScenario } from '../Compare/logic';
import { EV } from './copy';
import { createFinderClient } from './finderClient';
import { useProfile } from './hooks';
import { MAX_FIND_MATCHES, PRESETS, SEARCH_SPANS, matchLasts, openingStamp, ruleFromPreset } from './logic';
import { useRules } from './store';
import './Events.css';

const findClient = createFinderClient();

type Phase =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'done'; matches: TriggerMatch[]; days: number }
  | { kind: 'error'; message: string };

export function FindWindow({ onOpenCompare }: { onOpenCompare?: () => void }) {
  const app = useAppState();
  const { rules } = useRules();
  const { loading, profile } = useProfile();
  const [choice, setChoice] = useState<string>('preset:landing');
  const [days, setDays] = useState<number>(90);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [added, setAdded] = useState('');
  const cancelRef = useRef<(() => void) | null>(null);
  const uid = useId();

  const rule = useMemo<TriggerRule | null>(() => {
    if (choice.startsWith('rule:')) return rules.find((r) => r.id === choice.slice(5)) ?? null;
    const p = PRESETS.find((x) => `preset:${x.key}` === choice);
    return p ? ruleFromPreset(p, `find-${p.key}`) : null;
  }, [choice, rules]);

  // Any input change (including the site or start time) drops the old result and aborts a running search.
  const inputKey = `${choice}|${days}|${app.siteKey}|${rule ? JSON.stringify(rule) : ''}`;
  useEffect(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    findClient.cancelAll();
    setPhase({ kind: 'idle' });
    setAdded('');
  }, [inputKey]);
  useEffect(
    () => () => {
      cancelRef.current?.();
      findClient.cancelAll();
    },
    [],
  );

  function start() {
    if (!rule || loading) return;
    setAdded('');
    setPhase({ kind: 'searching' });
    cancelRef.current = findClient.run(
      {
        op: 'find',
        search: { rule, from: app.t, spanDays: days, maxMatches: MAX_FIND_MATCHES },
        site: app.siteGeo,
        profile,
      },
      (r) => {
        cancelRef.current = null;
        setPhase(r.ok ? { kind: 'done', matches: r.matches.slice(0, MAX_FIND_MATCHES), days } : { kind: 'error', message: r.error === 'worker' ? EV.find.noWorker : EV.find.failed });
      },
    );
  }

  function cancel() {
    cancelRef.current?.();
    cancelRef.current = null;
    findClient.cancelAll();
    setPhase({ kind: 'idle' });
  }

  function addToCompare(m: TriggerMatch) {
    const base = {
      site: app.isCustom || !app.site ? { latDeg: app.siteGeo.latDeg, lonDeg: app.siteGeo.lonDeg } : app.site.id,
      startISO: formatIso(app.t),
      slipDays: 0,
    };
    const list = app.scenarios.length === 0 ? [base] : app.scenarios;
    const next = addScenario(list, { ...base, startISO: formatIso(m.start) });
    if (next.length === list.length) {
      setAdded(EV.find.full(list.length));
      return;
    }
    app.setScenarios(next);
    setAdded(EV.find.added(SCENARIO_LABELS[next.length - 1]));
    onOpenCompare?.();
  }

  const searching = phase.kind === 'searching';
  const status =
    phase.kind === 'done'
      ? phase.matches.length === 0
        ? EV.find.nothing(phase.days)
        : phase.matches.length >= MAX_FIND_MATCHES
          ? EV.find.foundMore(phase.matches.length, phase.days)
          : EV.find.found(phase.matches.length, phase.days)
      : phase.kind === 'error'
        ? phase.message
        : '';

  return (
    <section aria-labelledby={`${uid}-h`} className="ev-section">
      <h3 id={`${uid}-h`} className="ev-h">
        {EV.find.heading}
      </h3>
      <p className="ev-note">{EV.find.intro}</p>
      <div className="ev-field">
        <label htmlFor={`${uid}-rule`}>{EV.find.ruleLabel}</label>
        <select id={`${uid}-rule`} value={choice} onChange={(e) => setChoice(e.target.value)}>
          {rules.length > 0 && (
            <optgroup label={EV.find.savedGroup}>
              {rules.map((r) => (
                <option key={r.id} value={`rule:${r.id}`}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label={EV.find.presetGroup}>
            {PRESETS.map((p) => (
              <option key={p.key} value={`preset:${p.key}`}>
                {p.label}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <div className="ev-field">
        <label htmlFor={`${uid}-span`}>{EV.find.spanLabel}</label>
        <select id={`${uid}-span`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {SEARCH_SPANS.map((d) => (
            <option key={d} value={d}>
              {EV.find.spans[d]}
            </option>
          ))}
        </select>
      </div>
      <div className="ev-actions">
        {searching ? (
          <button type="button" className="ev-btn" onClick={cancel}>
            {EV.find.cancel}
          </button>
        ) : (
          <button type="button" className="ev-btn ev-btn--primary" disabled={!rule || loading} onClick={start}>
            {EV.find.go}
          </button>
        )}
        {searching && (
          <p className="ev-note" aria-busy="true">
            <span className="ev-spin" aria-hidden="true" /> {EV.find.searching} {EV.find.searchingNote}
          </p>
        )}
      </div>
      <p className="ev-status" role="status" aria-live="polite">
        {status}
      </p>
      {phase.kind === 'done' && phase.matches.length > 0 && (
        <ol className="ev-list" aria-label={EV.find.listLabel}>
          {phase.matches.map((m) => {
            const when = openingStamp(m.start);
            return (
              <li key={m.start.getTime()} className="ev-item ev-item--stack">
                <span className="ev-row__main">{m.clippedStart ? EV.find.openNow(when, matchLasts(m)) : EV.find.opens(when, matchLasts(m), m.clippedEnd)}</span>
                <span className="ev-actions">
                  <button
                    type="button"
                    className="ev-btn"
                    aria-label={m.clippedStart ? EV.find.showOpenLabel(when) : EV.find.showLabel(when)}
                    onClick={() => app.setRangeStart(m.start)}
                  >
                    {EV.find.show}
                  </button>
                  <button
                    type="button"
                    className="ev-btn"
                    aria-label={m.clippedStart ? EV.find.compareOpenLabel(when) : EV.find.compareLabel(when)}
                    onClick={() => addToCompare(m)}
                  >
                    {EV.find.compare}
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="ev-status" role="status" aria-live="polite">
        {added}
      </p>
    </section>
  );
}
