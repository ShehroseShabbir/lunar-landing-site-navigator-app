import type { SiteEvent } from '../../state/events.types';
import { EV } from './copy';
import { eventActionLabel, eventGroup, eventSentence, shortStamp } from './logic';
import { formatUtc } from '../../state/time';

/** Shape tells Sun, Earth and both apart; the words say it too. */
function Glyph({ group }: { group: 'sun' | 'earth' | 'both' }) {
  return (
    <svg className="ev-glyph" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      {group === 'sun' && <circle cx="8" cy="8" r="5" fill="var(--sun)" />}
      {group === 'earth' && (
        <>
          <circle cx="8" cy="8" r="5.25" fill="none" stroke="var(--earth)" strokeWidth="1.5" />
          <path d="M4.3 11.7A5.25 5.25 0 0 1 4.3 4.3 3.6 3.6 0 0 0 4.3 11.7z" fill="var(--earth)" />
        </>
      )}
      {group === 'both' && <path d="M8 2 14 8 8 14 2 8z" fill="var(--both)" />}
    </svg>
  );
}

export function EventRow({
  ev,
  t,
  onGo,
  showGroup = false,
  past = false,
}: {
  ev: SiteEvent;
  t: Date;
  onGo: (d: Date) => void;
  showGroup?: boolean;
  past?: boolean;
}) {
  const group = eventGroup(ev.kind);
  return (
    <li className={past ? 'ev-item ev-item--past' : 'ev-item'}>
      <button type="button" className="ev-row" title={formatUtc(ev.t)} aria-label={`${eventSentence(ev, t)}. ${eventActionLabel(ev)}`} onClick={() => onGo(ev.t)}>
        <Glyph group={group} />
        <span className="ev-row__text">
          <span className="ev-row__main">{eventSentence(ev, t)}</span>
          <span className="ev-row__meta">
            {showGroup && <>{EV.group[group]} · </>}
            {shortStamp(ev.t)}
          </span>
        </span>
      </button>
    </li>
  );
}
