import { useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { BottomSheet } from './BottomSheet';
import { CollapseIcon, ExpandIcon } from './icons';
import { SHELL_COPY } from './copy';
import { ShellContext, useShell } from './ShellContext';
import type { SheetSnap } from './ShellContext';
import { useIsPhone } from './useMediaQuery';
import './Shell.css';

export interface ShellProps {
  /** Normally <Hero3D/>. Rendered inside <div id="stage">. */
  stage: ReactNode;
  /** <Breadcrumb siteName=.../> */
  breadcrumb: ReactNode;
  /** <TopActions .../> */
  actions: ReactNode;
  /** Left panel (phone: sheet body): tabs + Site or Planner details content. */
  panel: ReactNode;
  /** Bottom time dock (phone: the sheet header, so the time bar sits on the sheet's top edge). */
  dock: ReactNode;
  /** Bottom-right view-control column (B2 renders the toolbar and its look; the Shell only positions it). */
  icons?: ReactNode;
  /** Drawers (Compare, About lives inside TopActions). Rendered last. */
  drawers?: ReactNode;
  /** Planner details tab is active: panel is 440 px. */
  wide?: boolean;
  className?: string;
}

/** Button for the panel tab bar (B3 puts it last in the tab row). Hidden on phones. */
export function PanelCollapseButton() {
  const { isPhone, setCollapsed } = useShell();
  if (isPhone) return null;
  return (
    <button type="button" className="shell-collapse" aria-label={SHELL_COPY.collapsePanel} onClick={() => setCollapsed(true)}>
      <CollapseIcon />
    </button>
  );
}

/** Full-bleed layout: stage under everything; chrome docks to the edges (visual-spec 4). */
export function Shell({ stage, breadcrumb, actions, panel, dock, icons, drawers, wide = false, className }: ShellProps) {
  const isPhone = useIsPhone();
  const [collapsed, setCollapsed] = useState(false);
  const [snap, setSnap] = useState<SheetSnap>('half');
  const panelRef = useRef<HTMLElement>(null);
  const railBtn = useRef<HTMLButtonElement>(null);

  const panelWidth = isPhone ? 0 : collapsed ? 40 : wide ? 440 : 304;
  const ctx = useMemo(
    () => ({ isPhone, collapsed, setCollapsed, wide, panelWidth, snap, setSnap }),
    [isPhone, collapsed, wide, panelWidth, snap],
  );

  const skip = (e: MouseEvent) => {
    e.preventDefault();
    if (collapsed) setCollapsed(false);
    if (isPhone && snap === 'peek') setSnap('half');
    window.setTimeout(() => document.getElementById('panel')?.focus(), 0);
  };

  const collapse = (v: boolean) => {
    setCollapsed(v);
    window.setTimeout(() => {
      if (v) railBtn.current?.focus();
      else panelRef.current?.focus();
    }, 0);
  };

  return (
    <ShellContext.Provider value={{ ...ctx, setCollapsed: collapse }}>
      <div
        className={`shell${className ? ` ${className}` : ''}`}
        data-wide={wide ? 'true' : 'false'}
        data-collapsed={collapsed && !isPhone ? 'true' : 'false'}
        data-phone={isPhone ? 'true' : 'false'}
        data-snap={snap}
      >
        <a className="shell-skip" href="#panel" onClick={skip}>
          {SHELL_COPY.skipToPanel}
        </a>
        <header className="shell-top">
          {breadcrumb}
          <div className="shell-top__actions">{actions}</div>
        </header>
        <main className="shell-main" aria-label={SHELL_COPY.mainLabel}>
          {!isPhone && (
            <>
              <aside
                ref={panelRef}
                id="panel"
                className="shell-panel"
                aria-label={SHELL_COPY.panelLabel}
                tabIndex={-1}
                hidden={collapsed}
              >
                {panel}
              </aside>
              {collapsed && (
                <div className="shell-rail">
                  <button ref={railBtn} type="button" className="shell-collapse" aria-label={SHELL_COPY.expandPanel} onClick={() => collapse(false)}>
                    <ExpandIcon />
                  </button>
                </div>
              )}
            </>
          )}
          <div id="stage" className="shell-stage" role="region" aria-label={SHELL_COPY.stageLabel}>
            {stage}
          </div>
          {icons != null && <div className="shell-icons">{icons}</div>}
        </main>
        {isPhone ? (
          <BottomSheet snap={snap} onSnapChange={setSnap} header={dock} bodyId="panel">
            {panel}
          </BottomSheet>
        ) : (
          <div className="shell-dock" role="group" aria-label={SHELL_COPY.timeDockLabel}>
            {dock}
          </div>
        )}
        {drawers}
      </div>
    </ShellContext.Provider>
  );
}
