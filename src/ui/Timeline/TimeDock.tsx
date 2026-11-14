import { useAppState } from '../../state/AppState';
import { RANGE_DAYS } from '../../state/time';
import { PlaybackControls } from '../Playback';
import { Timeline } from './Timeline';
import { TL } from './copy';
import { dayMonth, dayOfRange, dockTime } from './dock';
import './Timeline.css';

/**
 * The bottom time dock: Play/Pause + speed, the current time, and the three lanes as the scrubber.
 * Layout-agnostic: the container decides width; the lanes can also be used alone via <Timeline/>.
 */
export function TimeDock() {
  const { t, rangeStart } = useAppState();
  return (
    <div className="time-dock">
      <div className="time-dock__left">
        <PlaybackControls />
        <div className="time-dock__read">
          <p className="time-dock__time">{dockTime(t)}</p>
          <p className="time-dock__day">
            {TL.dayOf(dayOfRange(t, rangeStart), RANGE_DAYS, dayMonth(rangeStart))}
          </p>
        </div>
      </div>
      <Timeline />
    </div>
  );
}
