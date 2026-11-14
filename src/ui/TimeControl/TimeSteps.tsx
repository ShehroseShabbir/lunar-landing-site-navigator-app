import { useAppState } from '../../state/AppState';
import { DAY_MS, HOUR_MS } from '../../state/time';
import { COPY } from '../Panel/copy';
import './TimeControl.css';

/** The hour/day step buttons (moved out of the When? control; embedded by Planner details). */
export function TimeSteps() {
  const { stepT } = useAppState();
  return (
    <div className="time-steps" role="group" aria-label={COPY.when.steps}>
      {COPY.steps.map((s) => (
        <button
          key={s.label}
          type="button"
          aria-label={s.aria}
          onClick={() => stepT(s.sign * (s.unit === 'd' ? DAY_MS : HOUR_MS))}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
