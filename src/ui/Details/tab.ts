// Which left-panel tab is open, kept in the URL hash so a shared link reproduces the view: `#/?tab=planner`.
// Hash (not query) because AppState rewrites the query on every state change but keeps the hash.
import { useCallback, useEffect, useState } from 'react';
import { joinHash, splitHash } from '../Compare/route';

export type PanelTab = 'site' | 'planner';

/** `tab=planner` in the hash, or in the query as a fallback. Anything else is the Site tab. */
export function tabFromLocation(hash: string, search = ''): PanelTab {
  const v = splitHash(hash).params.get('tab') ?? new URLSearchParams(search).get('tab');
  return v === 'planner' ? 'planner' : 'site';
}

/** The hash with the tab set. The Site tab removes the param; an empty result is `''` (no stray `#/`). */
export function hashWithTab(hash: string, tab: PanelTab): string {
  const { path, params } = splitHash(hash);
  if (tab === 'planner') params.set('tab', 'planner');
  else params.delete('tab');
  return path === '' && params.toString() === '' ? '' : joinHash(path, params);
}

/** Tab state synced with the URL. Changing the tab replaces the history entry (tabs are not navigation steps). */
export function usePanelTab(): [PanelTab, (tab: PanelTab) => void] {
  const read = () => tabFromLocation(window.location.hash, window.location.search);
  const [tab, setTabState] = useState<PanelTab>(read);
  useEffect(() => {
    const on = () => setTabState(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const setTab = useCallback((next: PanelTab) => {
    const { pathname, search, hash } = window.location;
    window.history.replaceState(null, '', `${pathname}${search}${hashWithTab(hash, next)}`);
    setTabState(next);
    // Other hook instances (and the compare drawer hook) listen for hashchange.
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, []);
  return [tab, setTab];
}
