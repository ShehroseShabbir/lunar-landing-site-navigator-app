import { useId, useMemo } from 'react';
import { useAppState } from '../../state/AppState';
import { nextEvents } from '../../state/events';
import { useScenarioResult } from '../../state/useScenarioResult';
import { EV } from './copy';
import { EventRow } from './EventRow';
import { mergeCoinciding } from './logic';
import './Events.css';

/** The next four events from the playhead, for the Site tab under the answers. */
export function NextEvents() {
  const { t, setT } = useAppState();
  const { scan } = useScenarioResult();
  const id = useId();
  const events = useMemo(() => (scan ? mergeCoinciding(nextEvents(scan, t, 6)).slice(0, 4) : null), [scan, t]);
  return (
    <section className="ev-next" aria-labelledby={id}>
      <h3 id={id} className="ev-h">
        {EV.next.heading}
      </h3>
      {events === null ? (
        <p className="ev-note">{EV.next.loading}</p>
      ) : events.length === 0 ? (
        <p className="ev-note">{EV.next.none}</p>
      ) : (
        <ul className="ev-list" aria-label={EV.next.listLabel}>
          {events.map(({ ev, alsoBoth }) => (
            <EventRow key={`${ev.kind}-${ev.t.getTime()}`} ev={ev} alsoBoth={alsoBoth} t={t} onGo={setT} />
          ))}
        </ul>
      )}
    </section>
  );
}
