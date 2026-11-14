import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import './Explain.css';

export interface ExplainCopy {
  title: string;
  body: string;
  /** aria-label for the trigger, e.g. "Why does the Sun skim the horizon?" */
  label: string;
}

/** ui-spec section 3.1. S10 adds W1-W4 and W8. */
export const EXPLAIN_COPY = {
  W5: {
    title: 'What does "Power OK" mean here?',
    label: 'Why? What does Power OK mean here?',
    body: "At least half of the Sun's disk is above the terrain horizon at this moment, so solar panels get meaningful light. It is a simple rule for comparing sites, not a power budget.",
  },
  W6: {
    title: 'What does "Comms OK" mean here?',
    label: 'Why? What does Comms OK mean here?',
    body: "Earth's centre is at least 0.5° above the terrain horizon, a small margin for antenna blockage. It means a direct line of sight, not a working link.",
  },
  W7: {
    title: 'What is "visible disk"?',
    label: 'Why? What is visible disk?',
    body: 'The Sun is about 0.53° wide, so near the horizon part of it can be hidden by terrain. This is the share of the disk still showing.',
  },
  W1: {
    title: 'Why does the Sun stay low near the poles?',
    label: 'Why? Why does the Sun stay low near the poles?',
    body: "The Moon's axis is tilted only about 1.5° from the flat plane of its orbit around the Sun. So near a pole the Sun never climbs high. It circles the sky just above or just below the horizon during one lunar day.",
  },
  W2: {
    title: 'Why does Earth bob in and out of view?',
    label: 'Why? Why does Earth bob in and out of view?',
    body: 'From the south pole, Earth stays close to the horizon. The Moon rocks slightly as it orbits (this is called libration). That moves Earth up and down by several degrees, so it can sink below the horizon and then come back.',
  },
  W3: {
    title: 'Why does terrain matter?',
    label: 'Why? Why does terrain matter?',
    body: 'Hills and crater rims can hide the Sun or Earth while they are still above the flat 0° line. Where we have lunar elevation data, we use the real horizon. Elsewhere we assume a smooth Moon, and say so.',
  },
  W4: {
    title: 'Why is sunset so sudden here?',
    label: 'Why? Why is sunset so sudden here?',
    body: 'The Moon has no air. Light is not bent or scattered, so there is no twilight and no glow after the Sun drops. We apply no refraction correction.',
  },
  W8: {
    title: 'Why is time in UTC?',
    label: 'Why? Why is time in UTC?',
    body: 'UTC (Coordinated Universal Time) is one shared world clock. Using it means everyone sees the same moment, whatever their time zone. Every time in this app is UTC.',
  },
} as const satisfies Record<string, ExplainCopy>;

export type ExplainId = keyof typeof EXPLAIN_COPY;

interface ExplainProps {
  /** Built-in copy id, or pass `copy` for S10 topics. */
  topic?: ExplainId;
  copy?: ExplainCopy;
  /** Optional "Learn more in About the data" link target or handler. */
  learnMore?: ReactNode;
}

/** "Why?" trigger (24 px visible, 44 px hit area) plus a non-modal dialog popover. Esc closes and returns focus. */
export function Explain({ topic, copy, learnMore }: ExplainProps) {
  const c = copy ?? (topic ? EXPLAIN_COPY[topic] : null);
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  if (!c) return null;
  return (
    <span className="explain" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="explain__btn"
        aria-label={c.label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="explain__icon" aria-hidden="true">
          ?
        </span>
        <span className="explain__text">Why?</span>
      </button>
      {open && (
        <div className="explain__pop" role="dialog" aria-labelledby={`${id}-t`} id={id}>
          <p className="explain__title" id={`${id}-t`}>
            {c.title}
          </p>
          <p className="explain__body">{c.body}</p>
          {learnMore ? <p className="explain__more">{learnMore}</p> : null}
        </div>
      )}
    </span>
  );
}
