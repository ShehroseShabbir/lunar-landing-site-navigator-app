import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AboutButton } from '../About/About';
import { Drawer } from './Drawer';
import { MenuIcon, ShareIcon } from './icons';
import { SHELL_COPY } from './copy';
import { useShell } from './ShellContext';

/** Small dropdown under a button: Esc and outside click close it, focus returns to the button. */
function SharePopover({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="top-pop">
      <button ref={btn} type="button" className="top-btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)}>
        <ShareIcon />
        {SHELL_COPY.share}
      </button>
      {open && (
        <div className="top-pop__panel" role="group" aria-label={SHELL_COPY.share}>
          {children}
        </div>
      )}
    </div>
  );
}

export interface TopActionsProps {
  /** Normally <TourButton/>. */
  tour?: ReactNode;
  /** Normally <ShareControls/>; shown in a dropdown under Share. */
  share?: ReactNode;
}

/** Top-right: Tour, About the data, Share. On a phone they sit behind one 44 px Menu button. */
export function TopActions({ tour, share }: TopActionsProps) {
  const { isPhone } = useShell();
  const [menu, setMenu] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);

  if (isPhone) {
    return (
      <>
        <button ref={menuBtn} type="button" className="top-btn top-btn--menu" aria-haspopup="dialog" onClick={() => setMenu(true)}>
          <MenuIcon />
          {SHELL_COPY.menu}
        </button>
        <Drawer open={menu} onClose={() => setMenu(false)} title={SHELL_COPY.menuTitle} returnFocusTo={menuBtn.current}>
          <div className="top-menu">
            {tour}
            <AboutButton />
            {share}
          </div>
        </Drawer>
      </>
    );
  }
  return (
    <nav className="top-actions" aria-label={SHELL_COPY.actionsLabel}>
      {tour}
      <AboutButton />
      {share != null && <SharePopover>{share}</SharePopover>}
    </nav>
  );
}
