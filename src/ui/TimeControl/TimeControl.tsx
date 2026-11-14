import { useEffect, useId, useRef, useState } from 'react';
import { useAppState } from '../../state/AppState';
import { DAY_MS, HOUR_MS, formatUtc, fromInputs, toDateInput, toTimeInput } from '../../state/time';
import { WhyUtc } from '../Explain/tour';
import './TimeControl.css';

const STEPS: { label: string; aria: string; ms: number }[] = [
  { label: '−1 d', aria: '\u22121 d, back one day', ms: -DAY_MS },
  { label: '−1 h', aria: '\u22121 h, back one hour', ms: -HOUR_MS },
  { label: '+1 h', aria: '+1 h, forward one hour', ms: HOUR_MS },
  { label: '+1 d', aria: '+1 d, forward one day', ms: DAY_MS },
];

export function TimeControl() {
  const { rangeStart, t, setRangeStart, stepT, setNow } = useAppState();
  const uid = useId();
  const [date, setDate] = useState(toDateInput(rangeStart));
  const [time, setTime] = useState(toTimeInput(rangeStart));

  // Follow external changes (Now, URL, compare slip).
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const a = document.activeElement;
    if (a === dateRef.current || a === timeRef.current) return; // never overwrite mid-typing
    setDate(toDateInput(rangeStart));
    setTime(toTimeInput(rangeStart));
  }, [rangeStart]);

  // Commit on blur or Enter only; an invalid or partial entry reverts to the current rangeStart.
  function commit(d: string, tm: string) {
    const parsed = fromInputs(d, tm);
    if (!parsed) {
      setDate(toDateInput(rangeStart));
      setTime(toTimeInput(rangeStart));
    } else if (parsed.getTime() !== rangeStart.getTime()) setRangeStart(parsed);
  }
  const onEnter = (e: React.KeyboardEvent) => e.key === 'Enter' && commit(date, time);

  return (
    <section className="time-control" aria-label="Time (UTC)">
      <div className="time-control__field">
        <label htmlFor={`${uid}-date`}>Date (UTC)</label>
        <input
          id={`${uid}-date`}
          type="date"
          value={date}
          ref={dateRef}
          onChange={(e) => setDate(e.target.value)}
          onBlur={() => commit(date, time)}
          onKeyDown={onEnter}
        />
      </div>
      <div className="time-control__field">
        <label htmlFor={`${uid}-time`}>Time (UTC)</label> <WhyUtc />
        <input
          id={`${uid}-time`}
          type="time"
          step={60}
          value={time}
          ref={timeRef}
          onChange={(e) => setTime(e.target.value)}
          onBlur={() => commit(date, time)}
          onKeyDown={onEnter}
        />
      </div>
      <span className="time-control__utc">UTC</span>
      <div className="time-control__buttons" role="group" aria-label="Move playhead">
        {STEPS.slice(0, 2).map((s) => (
          <button key={s.label} type="button" aria-label={s.aria} onClick={() => stepT(s.ms)}>
            {s.label}
          </button>
        ))}
        <button type="button" className="time-control__now" onClick={setNow}>
          Now
        </button>
        {STEPS.slice(2).map((s) => (
          <button key={s.label} type="button" aria-label={s.aria} onClick={() => stepT(s.ms)}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="time-control__playhead" role="status">
        Playhead: {formatUtc(t)}. 30-day window from {formatUtc(rangeStart)}.
      </p>
    </section>
  );
}
