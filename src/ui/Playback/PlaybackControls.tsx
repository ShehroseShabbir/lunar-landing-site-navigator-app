import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState } from '../../state/AppState';
import { advance, reducedStep, shouldUpdate, SPEEDS, windowEnd, type SpeedId } from './playback';
import { PB } from './copy';
import './Playback.css';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

export function PlaybackControls() {
  const { t, rangeStart, setT } = useAppState();
  const reduced = usePrefersReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [speedId, setSpeedId] = useState<SpeedId>('6h');
  const [announce, setAnnounce] = useState('');
  // Lets the answer announcer stay quiet while the time-lapse plays.
  useEffect(() => {
    document.documentElement.dataset.playing = playing ? 'true' : 'false';
    return () => {
      document.documentElement.dataset.playing = 'false';
    };
  }, [playing]);

  // Latest values for the animation loop (avoids restarting it on every t change).
  const tRef = useRef(t.getTime());
  tRef.current = t.getTime();
  const startRef = useRef(rangeStart.getTime());
  startRef.current = rangeStart.getTime();
  const setTRef = useRef(setT);
  setTRef.current = setT;

  const speed = SPEEDS.find((s) => s.id === speedId) ?? SPEEDS[1];

  const stop = useCallback((msg: string) => {
    setPlaying(false);
    setAnnounce(msg);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const end = () => windowEnd(startRef.current);
    const finish = (ms: number) => {
      setTRef.current(new Date(ms));
      stop(PB.reachedEnd(new Date(ms)));
    };

    if (reduced) {
      const id = window.setInterval(() => {
        const r = reducedStep(tRef.current, speed.simMsPerSec, end());
        if (r.ended) return finish(r.tMs);
        tRef.current = r.tMs;
        setTRef.current(new Date(r.tMs));
      }, 1000);
      return () => window.clearInterval(id);
    }

    let raf = 0;
    let last = performance.now();
    let accum = 0;
    const frame = (now: number) => {
      accum += now - last;
      last = now;
      if (shouldUpdate(accum)) {
        const r = advance(tRef.current, accum, speed.simMsPerSec, end());
        accum = 0;
        if (r.ended) return finish(r.tMs);
        tRef.current = r.tMs;
        setTRef.current(new Date(r.tMs));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, reduced, speed.simMsPerSec, stop]);

  // Pause when the tab is hidden.
  useEffect(() => {
    if (!playing) return;
    const onVis = () => {
      if (document.hidden) stop(PB.pausedAt(new Date(tRef.current)));
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [playing, stop]);

  const toggle = () => {
    if (playing) {
      stop(PB.pausedAt(new Date(tRef.current)));
      return;
    }
    // At the end of the window, restart from its start (rangeStart never moves).
    if (tRef.current >= windowEnd(startRef.current)) {
      tRef.current = startRef.current;
      setT(new Date(startRef.current));
    }
    setAnnounce(PB.started(speed.label));
    setPlaying(true);
  };

  return (
    <section className="playback" aria-label={PB.region}>
      <button
        type="button"
        className={playing ? 'playback__toggle playback__toggle--on' : 'playback__toggle'}
        aria-label={playing ? PB.pause : PB.play}
        onClick={toggle}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
          {playing ? (
            <path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" />
          ) : (
            <path d="M5 2.5v11l9-5.5z" fill="currentColor" />
          )}
        </svg>
      </button>
      <div className="playback__field">
        <label htmlFor="playback-speed" className="sr-only">
          {PB.speed}
        </label>
        <select id="playback-speed" value={speedId} onChange={(e) => setSpeedId(e.target.value as SpeedId)}>
          {SPEEDS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <p className="sr-only">{playing ? (reduced ? PB.stepping : PB.playingAt(speed.label)) : PB.paused}</p>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </section>
  );
}
