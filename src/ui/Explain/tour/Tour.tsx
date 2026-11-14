import { createPortal } from 'react-dom';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useAppState } from '../../../state/AppState';
import { formatUtc } from '../../Metrics/format';
import { getSite } from '../../../data/sites';
import { TOUR_DONE_MESSAGE, TOUR_STEPS } from './tourSteps';
import './Tour.css';

interface Saved {
  siteId: string | null;
  custom: { latDeg: number; lonDeg: number } | null;
  rangeStart: Date;
  t: Date;
}

const LAST = TOUR_STEPS.length - 1;

/** "Take the tour" button plus the non-modal step dialog. Never starts by itself. */
export function TourButton() {
  const app = useAppState();
  const { selectSite, setCustom, setRangeStart, setT } = app;
  const [step, setStep] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');
  const [host, setHost] = useState<HTMLElement | null>(null);
  const saved = useRef<Saved | null>(null);
  const current = useRef(app);
  const btn = useRef<HTMLButtonElement>(null);
  const dlg = useRef<HTMLDivElement>(null);
  const uid = useId();

  useEffect(() => {
    current.current = app;
  });

  const apply = useCallback(
    (i: number) => {
      const s = TOUR_STEPS[i];
      selectSite(s.siteId);
      setRangeStart(new Date(s.startIso));
      const t = new Date(s.tIso);
      setT(t);
      setAnnounce(`Showing ${getSite(s.siteId)?.name ?? s.siteId}, ${formatUtc(t)}`);
    },
    [selectSite, setRangeStart, setT],
  );

  const close = useCallback(() => {
    setStep(null);
    btn.current?.focus();
  }, []);

  const skip = useCallback(() => {
    const s = saved.current;
    if (s) {
      if (s.custom) setCustom(s.custom.latDeg, s.custom.lonDeg);
      else if (s.siteId) selectSite(s.siteId);
      setRangeStart(s.rangeStart);
      setT(s.t);
    }
    close();
  }, [close, selectSite, setCustom, setRangeStart, setT]);

  const start = () => {
    if (step !== null) {
      go(0); // restart: keep the original snapshot
      return;
    }
    const a = current.current;
    saved.current = {
      siteId: a.site?.id ?? null,
      custom: a.isCustom ? { latDeg: a.siteGeo.latDeg, lonDeg: a.siteGeo.lonDeg } : null,
      rangeStart: a.rangeStart,
      t: a.t,
    };
    apply(0);
    setStep(0);
  };

  const go = (i: number) => {
    apply(i);
    setStep(i);
  };

  const done = () => {
    setAnnounce(TOUR_DONE_MESSAGE);
    close();
  };

  // Focus the dialog on every step so a screen reader hears "Step N of 3", the title and the body.
  useEffect(() => {
    if (step !== null) dlg.current?.focus();
  }, [step, host]);

  // Highlight: outline on the target (no dimming, no animation), scrolled into view without animation.
  useEffect(() => {
    if (step === null) return;
    let el: Element | null = null;
    for (const name of TOUR_STEPS[step].targets) {
      el = document.querySelector(`[data-tour="${name}"]`);
      if (el) break;
    }
    if (!el) return;
    const target = el;
    target.setAttribute('data-tour-active', 'true');
    // Narrow layouts: the dialog is a bottom sheet, so put the target's top at the top of the screen.
    const narrow = window.matchMedia('(max-width: 1023px)').matches;
    target.scrollIntoView({ behavior: 'auto', block: narrow ? 'start' : 'nearest' });
    // Dialog goes right after the target in DOM order (Shift+Tab from Back reaches the target).
    const container = document.createElement('div');
    container.style.display = 'contents';
    target.after(container);
    setHost(container);
    return () => {
      target.removeAttribute('data-tour-active');
      container.remove();
      setHost(null);
    };
  }, [step]);

  // Esc = Skip tour, but an open "Why?" popover takes the first Esc.
  const open = step !== null;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.explain__pop, dialog[open], [aria-modal="true"]')) return;
      skip();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, skip]);

  const wrap = (node: ReactElement) => (host ? createPortal(node, host) : node);

  return (
    <>
      <button ref={btn} type="button" className="tour__btn" onClick={start} aria-haspopup="dialog">
        Take the tour
      </button>
      <p className="tour__sr" role="status">
        {announce}
      </p>
      {step !== null && wrap(
        <div
          ref={dlg}
          className="tour__dialog"
          role="dialog"
          aria-modal="false"
          aria-labelledby={`${uid}-n ${uid}-t`}
          aria-describedby={`${uid}-b`}
          tabIndex={-1}
        >
          <p className="tour__step" id={`${uid}-n`}>
            Step {step + 1} of {TOUR_STEPS.length}
          </p>
          <h2 className="tour__title" id={`${uid}-t`}>
            {TOUR_STEPS[step].title}
          </h2>
          <p className="tour__body" id={`${uid}-b`}>
            {TOUR_STEPS[step].body}
          </p>
          <div className="tour__actions">
            <button type="button" className="tour__action tour__action--back" disabled={step === 0} onClick={() => go(step - 1)}>
              Back
            </button>
            {step < LAST ? (
              <button type="button" className="tour__action tour__action--next tour__action--primary" onClick={() => go(step + 1)}>
                Next
              </button>
            ) : (
              <button type="button" className="tour__action tour__action--next tour__action--primary" onClick={done}>
                Done
              </button>
            )}
            <button type="button" className="tour__action tour__action--skip tour__action--text" onClick={skip}>
              Skip tour
            </button>
          </div>
        </div>,
      )}
    </>
  );
}
