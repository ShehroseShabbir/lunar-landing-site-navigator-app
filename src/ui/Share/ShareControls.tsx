import { useEffect, useRef, useState } from 'react';
import { useAppState } from '../../state/AppState';
import { useScenarioResult } from '../../state/useScenarioResult';
import { buildWindowsCsv, csvFileName } from './csv';
import './ShareControls.css';

export function ShareControls() {
  const app = useAppState();
  const { scan, status } = useScenarioResult();
  const calculating = status === 'loading';
  const [msg, setMsg] = useState('');
  const [fallback, setFallback] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (fallback) inputRef.current?.select();
  }, [fallback]);

  const flash = (m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(''), 2000);
  };

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(window.location.href);
      setFallback(false);
      flash('Link copied');
    } catch {
      setFallback(true);
      flash('Select the link and copy it');
    }
  }

  function download() {
    if (!scan || calculating) return;
    const csv = buildWindowsCsv([
      {
        label: 'A',
        siteName: app.siteName,
        lat: app.siteGeo.latDeg,
        lon: app.siteGeo.lonDeg,
        rangeStart: app.rangeStart,
        scan,
      },
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = csvFileName(app.siteKey, app.rangeStart);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    flash('CSV downloaded');
  }

  return (
    <div className="share">
      <button type="button" onClick={copy}>
        Copy link
      </button>
      <button type="button" onClick={download} disabled={!scan || calculating} aria-describedby="share-export-help">
        Export CSV
      </button>
      <span id="share-export-help" className="share__status">
        {calculating ? 'Calculating…' : ''}
      </span>
      {fallback && (
        <input
          ref={inputRef}
          className="share__fallback"
          readOnly
          aria-label="Link to this view"
          value={window.location.href}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      <span className="share__status" role="status" aria-live="polite">
        {msg}
      </span>
    </div>
  );
}
