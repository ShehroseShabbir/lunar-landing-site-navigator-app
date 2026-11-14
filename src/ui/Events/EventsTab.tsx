import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAppState } from '../../state/AppState';
import { listEvents } from '../../state/events';
import type { TriggerMatch, TriggerRule } from '../../state/events.types';
import { rangeEnd } from '../../state/time';
import { toICS } from '../../state/triggers';
import { useScenarioResult } from '../../state/useScenarioResult';
import { EV } from './copy';
import { EventRow } from './EventRow';
import { FindWindow } from './FindWindow';
import { useRuleMatches, type RuleMatches } from './hooks';
import {
  MAX_RULES,
  PRESETS,
  blankRule,
  filterEvents,
  icsFileName,
  matchLasts,
  nextRuleId,
  openingStamp,
  parseOptionalNumber,
  shortStamp,
  ruleFromPreset,
  type EventFilter,
} from './logic';
import { rulesStore, useRules } from './store';
import './Events.css';

const FILTERS: EventFilter[] = ['all', 'sun', 'earth', 'both'];

function EventList() {
  const { t, setT, rangeStart } = useAppState();
  const { scan } = useScenarioResult();
  const [filter, setFilter] = useState<EventFilter>('all');
  const all = useMemo(() => (scan ? listEvents(scan, rangeStart, rangeEnd(rangeStart)) : null), [scan, rangeStart]);
  const shown = useMemo(() => (all ? filterEvents(all, filter) : []), [all, filter]);
  const uid = useId();
  const divider = (
    <li key="now" className="ev-divider">
      {EV.triggers.selectedTime(shortStamp(t))}
    </li>
  );
  return (
    <section aria-labelledby={`${uid}-h`} className="ev-section">
      <h3 id={`${uid}-h`} className="ev-h">
        {EV.tab.heading}
      </h3>
      <p className="ev-note">{EV.tab.intro}</p>
      <div role="group" aria-label={EV.tab.filterLabel} className="ev-chips">
        {FILTERS.map((f) => (
          <button key={f} type="button" className="ev-chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {EV.tab.filters[f]}
          </button>
        ))}
      </div>
      {all === null ? (
        <p className="ev-note">{EV.next.loading}</p>
      ) : shown.length === 0 ? (
        <p className="ev-note">{EV.tab.empty}</p>
      ) : (
        <>
          <p className="ev-meta" aria-live="off">
            {EV.tab.count(shown.length)}
          </p>
          <ul className="ev-list" aria-label={EV.tab.listLabel}>
            {shown.flatMap((ev, i) => {
              const row = <EventRow key={`${ev.kind}-${ev.t.getTime()}`} ev={ev} t={t} onGo={setT} showGroup past={ev.t.getTime() < t.getTime()} />;
              const first = ev.t.getTime() >= t.getTime() && (i === 0 || shown[i - 1].t.getTime() < t.getTime());
              return first && i > 0 ? [divider, row] : [row];
            })}
            {shown[shown.length - 1].t.getTime() < t.getTime() && divider}
          </ul>
        </>
      )}
    </section>
  );
}

function NumberField({
  label,
  hint,
  error,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  error: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  const bad = error !== '';
  return (
    <div className="ev-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        aria-invalid={bad}
        aria-describedby={`${id}-d`}
        onChange={(e) => onChange(e.target.value)}
      />
      <p id={`${id}-d`} className={bad ? 'ev-hint ev-hint--bad' : 'ev-hint'}>
        {bad ? error : hint}
      </p>
    </div>
  );
}

const fmt = (n: number | undefined) => (n === undefined ? '' : String(n));

function RuleEditor({ rule }: { rule: TriggerRule }) {
  const nameId = useId();
  const [sun, setSun] = useState(fmt(rule.sunMinAboveTerrainDeg));
  const [earth, setEarth] = useState(fmt(rule.earthMinAboveTerrainDeg));
  const [hours, setHours] = useState(fmt(rule.minDurationH));
  const sunV = parseOptionalNumber(sun, 0, 90);
  const earthV = parseOptionalNumber(earth, 0, 90);
  const hoursV = parseOptionalNumber(hours, 0, 720);
  const none = !rule.requirePower && !rule.requireComms;

  // Valid typed values flow into the rule; invalid ones keep the last good rule value.
  function commit(patch: { sun?: string; earth?: string; hours?: string }) {
    const s = parseOptionalNumber(patch.sun ?? sun, 0, 90);
    const e = parseOptionalNumber(patch.earth ?? earth, 0, 90);
    const h = parseOptionalNumber(patch.hours ?? hours, 0, 720);
    const next: TriggerRule = { ...rule };
    if (s !== null) {
      if (s === undefined) delete next.sunMinAboveTerrainDeg;
      else next.sunMinAboveTerrainDeg = s;
    }
    if (e !== null) {
      if (e === undefined) delete next.earthMinAboveTerrainDeg;
      else next.earthMinAboveTerrainDeg = e;
    }
    if (h !== null) next.minDurationH = h ?? 0;
    rulesStore.replace(next);
  }

  return (
    <fieldset className="ev-fieldset">
      <legend>{EV.triggers.editorLegend}</legend>
      <div className="ev-field">
        <label htmlFor={nameId}>{EV.triggers.name}</label>
        <input
          id={nameId}
          type="text"
          maxLength={40}
          autoComplete="off"
          value={rule.name}
          onChange={(e) => rulesStore.update(rule.id, { name: e.target.value })}
        />
      </div>
      <label className="ev-check">
        <input
          type="checkbox"
          checked={rule.requirePower}
          onChange={(e) => rulesStore.update(rule.id, { requirePower: e.target.checked })}
        />
        <span>{EV.triggers.power}</span>
      </label>
      <label className="ev-check">
        <input
          type="checkbox"
          checked={rule.requireComms}
          onChange={(e) => rulesStore.update(rule.id, { requireComms: e.target.checked })}
        />
        <span>{EV.triggers.comms}</span>
      </label>
      {none && (
        <p className="ev-hint ev-hint--bad" role="alert">
          {EV.triggers.needOne}
        </p>
      )}
      <NumberField
        label={EV.triggers.sunMin}
        hint={EV.triggers.anyHint}
        error={sunV === null ? EV.triggers.degInvalid : ''}
        value={sun}
        onChange={(v) => {
          setSun(v);
          commit({ sun: v });
        }}
      />
      <NumberField
        label={EV.triggers.earthMin}
        hint={EV.triggers.anyHint}
        error={earthV === null ? EV.triggers.degInvalid : ''}
        value={earth}
        onChange={(v) => {
          setEarth(v);
          commit({ earth: v });
        }}
      />
      <NumberField
        label={EV.triggers.hours}
        hint={EV.triggers.hoursHint}
        error={hoursV === null ? EV.triggers.hoursInvalid : ''}
        value={hours}
        onChange={(v) => {
          setHours(v);
          commit({ hours: v });
        }}
      />
    </fieldset>
  );
}

function MatchList({ rule, state, siteName }: { rule: TriggerRule; state: RuleMatches; siteName: string }) {
  const { setRangeStart } = useAppState();
  const matches: TriggerMatch[] = state.matches;
  const [downloadNote, setDownloadNote] = useState('');
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => void (urlRef.current && URL.revokeObjectURL(urlRef.current)), []);

  function download() {
    const blob = new Blob([toICS(matches, rule, siteName)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = url;
    const a = document.createElement('a');
    a.href = url;
    a.download = icsFileName(rule.name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setDownloadNote(`${icsFileName(rule.name)} downloaded.`);
  }

  return (
    <div className="ev-matches">
      <h4 className="ev-h2">{EV.triggers.matchesHeading}</h4>
      {state.status === 'loading' ? (
        <p className="ev-note">{EV.triggers.computing}</p>
      ) : state.status === 'error' ? (
        <p className="ev-note ev-hint--bad">{EV.triggers.error}</p>
      ) : matches.length === 0 ? (
        <p className="ev-note">{EV.triggers.matchesNone}</p>
      ) : (
        <>
          <p className="ev-meta">
            {EV.triggers.matchCount(matches.length)}. {EV.triggers.dock}
          </p>
          <ul className="ev-list" aria-label={EV.triggers.matchesLabel(rule.name)}>
            {matches.map((m) => (
              <li key={m.start.getTime()} className="ev-item ev-item--split">
                <span className="ev-row__text">
                  <span className="ev-row__main">{m.clippedStart ? EV.triggers.alreadyOpen(openingStamp(m.start)) : openingStamp(m.start)}</span>
                  <span className="ev-row__meta">
                    {m.clippedStart ? EV.triggers.lastsAtLeast(matchLasts(m)) : `Lasts ${matchLasts(m)}${m.clippedEnd ? EV.triggers.orLonger : ''}`}
                  </span>
                </span>
                <button
                  type="button"
                  className="ev-btn"
                  aria-label={m.clippedStart ? EV.triggers.showOpenLabel(openingStamp(m.start)) : EV.triggers.showLabel(openingStamp(m.start))}
                  onClick={() => setRangeStart(m.start)}
                >
                  {EV.triggers.show}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" className="ev-btn ev-btn--wide" disabled={matches.length === 0} onClick={download}>
        {EV.triggers.ics}
      </button>
      {matches.length === 0 && state.status === 'ready' && <p className="ev-hint">{EV.triggers.icsNone}</p>}
      <p className="ev-hint" role="status">
        {downloadNote}
      </p>
    </div>
  );
}

function Triggers() {
  const { rules, selectedId } = useRules();
  const { siteName } = useAppState();
  const matches = useRuleMatches(rules);
  const selected = rules.find((r) => r.id === selectedId) ?? null;
  const uid = useId();
  const full = rules.length >= MAX_RULES;
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const headRef = useRef<HTMLHeadingElement | null>(null);
  const focusAfter = useRef<string | null>(null);
  useEffect(() => {
    const f = focusAfter.current;
    if (!f) return;
    focusAfter.current = null;
    (f === 'head' ? headRef.current : rowRefs.current[f])?.focus();
  }, [rules]);
  function removeRule(id: string) {
    const i = rules.findIndex((r) => r.id === id);
    const next = rules[i + 1] ?? rules[i - 1];
    focusAfter.current = next ? next.id : 'head';
    rulesStore.remove(id);
  }

  return (
    <section aria-labelledby={`${uid}-h`} className="ev-section">
      <h3 id={`${uid}-h`} className="ev-h" ref={headRef} tabIndex={-1}>
        {EV.triggers.heading}
      </h3>
      <p className="ev-note">{EV.triggers.intro}</p>
      <p className="ev-honesty">{EV.triggers.honesty}</p>

      {rules.length === 0 ? (
        <p className="ev-note">{EV.triggers.none}</p>
      ) : (
        <ul className="ev-list" aria-label={EV.triggers.listLabel}>
          {rules.map((r) => (
            <li key={r.id} className="ev-item ev-item--split">
              <button
                type="button"
                className="ev-row ev-row--rule"
                ref={(el) => {
                  rowRefs.current[r.id] = el;
                }}
                aria-pressed={r.id === selectedId}
                aria-label={EV.triggers.select(r.name)}
                onClick={() => rulesStore.select(r.id)}
              >
                <span className="ev-row__text">
                  <span className="ev-row__main">{r.name}</span>
                  <span className="ev-row__meta">
                    {matches[r.id]?.status === 'ready' ? EV.triggers.matchCount(matches[r.id].matches.length) : EV.triggers.computing}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="ev-btn"
                aria-label={EV.triggers.removeLabel(r.name)}
                onClick={() => removeRule(r.id)}
              >
                {EV.triggers.remove}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div role="group" aria-label={EV.triggers.presetsLabel} className="ev-presets">
        <p className="ev-meta">{EV.triggers.presetsLabel}</p>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className="ev-btn ev-btn--wide"
            disabled={full}
            onClick={() => rulesStore.add(ruleFromPreset(p, nextRuleId(rulesStore.getSnapshot().rules)))}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className="ev-btn ev-btn--wide"
          disabled={full}
          onClick={() => rulesStore.add(blankRule(nextRuleId(rulesStore.getSnapshot().rules)))}
        >
          {EV.triggers.blank}
        </button>
        {full && <p className="ev-hint">{EV.triggers.maxRules(MAX_RULES)}</p>}
      </div>

      {selected && (
        <>
          <RuleEditor key={selected.id} rule={selected} />
          <MatchList rule={selected} state={matches[selected.id] ?? { status: 'loading', matches: [] }} siteName={siteName} />
        </>
      )}
      {rules.length > 0 && <p className="ev-hint">{EV.triggers.shared}</p>}
    </section>
  );
}

export interface EventsTabProps {
  /** Opens the Compare drawer after FindWindow adds an option (optional). */
  onOpenCompare?: () => void;
}

/** Content of the Events panel tab: event list, triggers, and the landing-window finder. */
export function EventsTab({ onOpenCompare }: EventsTabProps = {}) {
  return (
    <div className="ev-tab">
      <EventList />
      <Triggers />
      <FindWindow onOpenCompare={onOpenCompare} />
    </div>
  );
}
