import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { CloseIcon } from './icons';
import { SHELL_COPY } from './copy';
import './Drawer.css';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Desktop width in px (phone is always full width). */
  width?: number;
  /** Element to refocus on close; defaults to the element focused when opened. */
  returnFocusTo?: HTMLElement | null;
  className?: string;
  children: ReactNode;
}

/**
 * Right drawer: a native modal <dialog> (focus trap, Esc, inert background), top 48 px to the bottom.
 * Children mount only while open. Focus returns to the opener on close.
 */
export function Drawer({ open, onClose, title, width = 440, returnFocusTo, className, children }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      opener.current = document.activeElement as HTMLElement | null;
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    } else if (!open && dlg.open) {
      if (typeof dlg.close === 'function') dlg.close();
      else dlg.removeAttribute('open');
    }
  }, [open]);

  const handleClose = () => {
    const el = returnFocusTo ?? opener.current;
    if (el && el.isConnected) el.focus();
    onClose();
  };

  return (
    <dialog
      ref={ref}
      className={`drawer${className ? ` ${className}` : ''}`}
      style={{ ['--drawer-w' as string]: `${width}px` }}
      aria-labelledby={titleId}
      aria-modal="true"
      onClose={handleClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      {open && (
        <>
          <div className="drawer__head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="drawer__close" aria-label={SHELL_COPY.closeDrawer(title)} onClick={() => ref.current?.close()}>
              <CloseIcon />
            </button>
          </div>
          <div className="drawer__body" tabIndex={0} role="region" aria-labelledby={titleId}>
            {children}
          </div>
        </>
      )}
    </dialog>
  );
}
