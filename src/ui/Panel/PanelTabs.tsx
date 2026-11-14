import { useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { COPY } from './copy';
import './Panel.css';

export type PanelTab = 'site' | 'details';

export interface PanelTabsProps {
  /** Content of the Site tab (normally <SitePanel/>). */
  site: ReactNode;
  /** Content of the Planner details tab (B4's PlannerDetails). Mounted only while its tab is active. */
  details: ReactNode;
  /** Controlled tab; omit for uncontrolled. */
  tab?: PanelTab;
  defaultTab?: PanelTab;
  onTabChange?: (tab: PanelTab) => void;
  /** Shows the « collapse button when given. */
  onCollapse?: () => void;
}

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'site', label: COPY.tabs.site },
  { id: 'details', label: COPY.tabs.details },
];

export function PanelTabs({ site, details, tab, defaultTab = 'site', onTabChange, onCollapse }: PanelTabsProps) {
  const [inner, setInner] = useState<PanelTab>(defaultTab);
  const active = tab ?? inner;
  const uid = useId();
  const refs = useRef<Record<PanelTab, HTMLButtonElement | null>>({ site: null, details: null });

  const select = (id: PanelTab, focus = false) => {
    setInner(id);
    onTabChange?.(id);
    if (focus) refs.current[id]?.focus();
  };

  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    const i = TABS.findIndex((x) => x.id === active);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    select(TABS[next].id, true);
  }

  return (
    <div className="panel-tabs">
      <div className="panel-tabs__bar">
        <div role="tablist" aria-label={COPY.tabs.label} className="panel-tabs__list">
          {TABS.map((x) => (
            <button
              key={x.id}
              ref={(el) => {
                refs.current[x.id] = el;
              }}
              id={`${uid}-tab-${x.id}`}
              type="button"
              role="tab"
              aria-selected={active === x.id}
              aria-controls={`${uid}-panel-${x.id}`}
              tabIndex={active === x.id ? 0 : -1}
              className="panel-tabs__tab"
              onClick={() => select(x.id)}
              onKeyDown={onKey}
            >
              {x.label}
            </button>
          ))}
        </div>
        {onCollapse && (
          <button
            type="button"
            className="panel-tabs__collapse"
            aria-label={COPY.tabs.collapse}
            title={COPY.tabs.collapse}
            onClick={onCollapse}
          >
            <span aria-hidden="true">«</span>
          </button>
        )}
      </div>
      <div
        role="tabpanel"
        id={`${uid}-panel-${active}`}
        aria-labelledby={`${uid}-tab-${active}`}
        className="panel-tabs__panel"
        tabIndex={-1}
      >
        {active === 'site' ? site : details}
      </div>
    </div>
  );
}
