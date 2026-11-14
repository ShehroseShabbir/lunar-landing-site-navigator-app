import { useEffect, useState } from 'react';

export type Route = 'main' | 'compare';

export function routeFromHash(hash: string): Route {
  return hash.replace(/^#\/?/, '').split(/[?/]/)[0] === 'compare' ? 'compare' : 'main';
}

/** Tiny hash router: `#/compare` is the compare view, anything else is the main view. */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
