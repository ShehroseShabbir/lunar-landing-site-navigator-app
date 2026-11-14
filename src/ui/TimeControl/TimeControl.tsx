import { useEffect, useId, useRef, useState } from 'react';
import { useAppState } from '../../state/AppState';
import { fromInputs, toDateInput, toTimeInput } from '../../state/time';
import { WhyUtc } from '../Explain/tour';
import { COPY } from '../Panel/copy';
import './TimeControl.css';

export function TimeControl() {
  const { t, setT, setNow } = useAppState();
  const uid = useId();
  const [date, setDate] = useState(toDateInput(t));
  const [time, setTime] = useState(toTimeInput(t));

  // When? shows the selected time (the playhead); setting it moves the playhead. The window start lives in Planner details.
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const a = document.activeElement;
    if (a === dateRef.current || a === timeRef.current) return; // never overwrite mid-typing
    setDate(toDateInput(t));
    setTime(toTimeInput(t));
  }, [t]);

  // Commit on blur or Enter only; an invalid or partial entry reverts to the current rangeStart.
  function commit(d: string, tm: string) {
    const parsed = fromInputs(d, tm);
    if (!parsed) {
      setDate(toDateInput(t));
      setTime(toTimeInput(t));
    } else if (parsed.getTime() !== t.getTime()) setT(parsed);
  }
  const onEnter = (e: React.KeyboardEvent) => e.key === 'Enter' && commit(date, time);

  const C = COPY.when;
  return (
    <section className="time-control" aria-label={C.group}>
      <div className="time-control__head">
        <p className="time-control__title">
          <span aria-hidden="true">
            {C.label} {C.labelUtc}
          </span>
          <WhyUtc />
        </p>
        <button type="button" className="time-control__now" onClick={setNow}>
          {C.now}
        </button>
      </div>
      <div className="time-control__row">
        <div className="time-control__field">
          <label htmlFor={`${uid}-date`}>{C.date}</label>
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
          <label htmlFor={`${uid}-time`}>{C.time}</label>
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
      </div>
    </section>
  );
}
