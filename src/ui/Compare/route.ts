import { useCallback, useEffect, useState } from 'react';

export type Route = 'main' | 'compare';

export function routeFromHash(hash: string): Route {
  return hash.replace(/^#\/?/, '').split(/[?/]/)[0] === 'compare' ? 'compare' : 'main';
}

/** `#/compare?tab=planner` gives path `compare` and params `tab=planner`. Hash params survive AppState's query rewrites. */
export function splitHash(hash: string): { path: string; params: URLSearchParams } {
  const raw = hash.replace(/^#\/?/, '');
  const q = raw.indexOf('?');
  return {
    path: (q < 0 ? raw : raw.slice(0, q)).replace(/\/$/, ''),
    params: new URLSearchParams(q < 0 ? '' : raw.slice(q + 1)),
  };
}

export function joinHash(path: string, params: URLSearchParams): string {
  const qs = params.toString();
  return `#/${path}${qs ? `?${qs}` : ''}`;
}

/** The hash that opens or closes the compare drawer, keeping other hash params (such as the open tab). */
export function hashWithCompare(hash: string, open: boolean): string {
  return joinHash(open ? 'compare' : '', splitHash(hash).params);
}

/** Tiny hash router: `#/compare` is the compare view, anything else is the main view. */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash));
  useEffect(() => {
    const on = () => {
      const r = routeFromHash(window.location.hash);
      if (r === 'main') pushedByOpen = false;
      setRoute(r);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

/** True while the current history entry was pushed by opening the drawer in this session. */
let pushedByOpen = false;

/** Compare drawer state synced with the hash: `#/compare` is open. Opening adds a history entry, so Back closes it. */
export function useCompareDrawer(): { open: boolean; setOpen: (open: boolean) => void } {
  const route = useHashRoute();
  const setOpen = useCallback((open: boolean) => {
    const next = hashWithCompare(window.location.hash, open);
    if (open) {
      if (window.location.hash !== next) pushedByOpen = true;
      window.location.hash = next;
    } else if (pushedByOpen) {
      // Opening pushed an entry: go back so Back does not reopen the drawer.
      pushedByOpen = false;
      window.history.back();
    } else if (window.location.hash !== next) {
      window.history.replaceState(null, '', next);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  }, []);
  return { open: route === 'compare', setOpen };
}
