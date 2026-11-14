import { useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import type { SheetSnap } from './ShellContext';
import { DownIcon, UpIcon } from './icons';
import { SHELL_COPY } from './copy';
import './BottomSheet.css';

const ORDER: SheetSnap[] = ['peek', 'half', 'full'];
const TOP_GAP = 48;
const HALF_RATIO = 0.46;

export interface BottomSheetProps {
  snap: SheetSnap;
  onSnapChange: (s: SheetSnap) => void;
  /** Always visible under the handle (the time bar sits on the sheet's top edge). */
  header?: ReactNode;
  /** Body: hidden at "peek". */
  children: ReactNode;
  /** id for the scrollable body (skip-link target). */
  bodyId?: string;
}

/** Phone bottom sheet: three snap points; drag the handle, or use the arrow keys or the buttons. */
export function BottomSheet({ snap, onSnapChange, header, children, bodyId }: BottomSheetProps) {
  const sheet = useRef<HTMLElement>(null);
  const handleRow = useRef<HTMLDivElement>(null);
  const headerEl = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  const i = ORDER.indexOf(snap);

  // Publish the real sheet height so the stage ends exactly where the sheet starts.
  useLayoutEffect(() => {
    const el = sheet.current;
    const shell = el?.closest<HTMLElement>('.shell');
    if (!el || !shell) return;
    const publish = () => shell.style.setProperty('--sheet-h', `${Math.round(el.getBoundingClientRect().height)}px`);
    publish();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      shell.style.removeProperty('--sheet-h');
    };
  }, []);
  const set = (n: number) => onSnapChange(ORDER[Math.max(0, Math.min(2, n))]);

  const heights = () => {
    const vh = window.innerHeight;
    const peek = (handleRow.current?.offsetHeight ?? 44) + (headerEl.current?.offsetHeight ?? 0);
    return [peek, vh * HALF_RATIO, vh - TOP_GAP];
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!sheet.current) return;
    drag.current = { y: e.clientY, h: sheet.current.getBoundingClientRect().height, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !sheet.current) return;
    const dy = d.y - e.clientY;
    if (Math.abs(dy) > 4) d.moved = true;
    if (!d.moved) return;
    const hs = heights();
    sheet.current.style.transition = 'none';
    sheet.current.style.height = `${Math.max(hs[0], Math.min(hs[2], d.h + dy))}px`;
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    const el = sheet.current;
    if (!d || !el) return;
    if (!d.moved) {
      set(i === 2 ? 1 : i + 1);
      return;
    }
    const cur = el.getBoundingClientRect().height;
    const hs = heights();
    let best = 0;
    hs.forEach((h, k) => {
      if (Math.abs(h - cur) < Math.abs(hs[best] - cur)) best = k;
    });
    el.style.transition = '';
    el.style.height = '';
    set(best);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key;
    if (k === 'ArrowUp' || k === 'PageUp') set(i + 1);
    else if (k === 'ArrowDown' || k === 'PageDown') set(i - 1);
    else if (k === 'Home') set(0);
    else if (k === 'End') set(2);
    else if (k === 'Enter' || k === ' ') set(i === 2 ? 1 : i + 1);
    else return;
    e.preventDefault();
  };

  return (
    <section ref={sheet} className="sheet" data-snap={snap} aria-label={SHELL_COPY.sheetLabel}>
      <div ref={handleRow} className="sheet__handle-row">
        <div
          className="sheet__handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label={SHELL_COPY.sheetResize}
          aria-valuemin={0}
          aria-valuemax={2}
          aria-valuenow={i}
          aria-valuetext={SHELL_COPY.sheetSnapText[snap]}
          tabIndex={0}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKey}
        >
          <span className="sheet__grip" aria-hidden="true" />
        </div>
        <button type="button" className="sheet__btn" aria-label={SHELL_COPY.sheetShowLess} disabled={i === 0} onClick={() => set(i - 1)}>
          <DownIcon />
        </button>
        <button type="button" className="sheet__btn" aria-label={SHELL_COPY.sheetShowMore} disabled={i === 2} onClick={() => set(i + 1)}>
          <UpIcon />
        </button>
      </div>
      {header && (
        <div ref={headerEl} className="sheet__header">
          {header}
        </div>
      )}
      <div id={bodyId} className="sheet__body" tabIndex={-1} hidden={snap === 'peek'}>
        {children}
      </div>
    </section>
  );
}
