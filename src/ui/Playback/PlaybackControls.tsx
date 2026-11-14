import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState } from '../../state/AppState';
import { formatUtc } from '../../state/time';
import { advance, reducedStep, shouldUpdate, SPEEDS, windowEnd, type SpeedId } from './playback';
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
      stop(`Playback reached the end of the 30-day window at ${formatUtc(new Date(ms))}`);
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
      if (document.hidden) stop(`Playback paused at ${formatUtc(new Date(tRef.current))}`);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [playing, stop]);

  const toggle = () => {
    if (playing) {
      stop(`Playback paused at ${formatUtc(new Date(tRef.current))}`);
      return;
    }
    // At the end of the window, restart from its start (rangeStart never moves).
    if (tRef.current >= windowEnd(startRef.current)) {
      tRef.current = startRef.current;
      setT(new Date(startRef.current));
    }
    setAnnounce(`Playback started at ${speed.label}`);
    setPlaying(true);
  };

  return (
    <section className="playback" aria-label="Time-lapse playback">
      <button type="button" className={playing ? 'playback__toggle playback__toggle--on' : 'playback__toggle'} onClick={toggle}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <div className="playback__field">
        <label htmlFor="playback-speed">Speed</label>
        <select id="playback-speed" value={speedId} onChange={(e) => setSpeedId(e.target.value as SpeedId)}>
          {SPEEDS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <p className="playback__status">
        {playing ? (reduced ? 'Stepping (reduced motion)' : `Playing at ${speed.label}`) : 'Paused'}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </section>
  );
}
