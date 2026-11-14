import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SiteGeo } from '../astro/types';
import { getSite, siteGeo, type Site } from '../data/sites';
import { roundToHour, setRangeStart as setRangeStartRule, setT as setTRule, stepT } from './time';
import { decodeState, encodeState, type Scenario, type ViewState } from './url';

export interface AppState {
  /** Selected catalogue site; null while custom coordinates are active. */
  site: Site | null;
  isCustom: boolean;
  /** Coordinates of the active site (catalogue or custom). */
  siteGeo: SiteGeo;
  /** Display name of the active site. */
  siteName: string;
  /** Stable key for memoising scans: site id or `custom:lat,lon`. */
  siteKey: string;
  rangeStart: Date;
  t: Date;
  scenarios: Scenario[];
  selectSite(id: string): void;
  setCustom(latDeg: number, lonDeg: number): void;
  /** Date/time inputs, Now, compare slip: sets rangeStart and moves t to it. */
  setRangeStart(d: Date): void;
  /** Playhead; rangeStart follows if t leaves the 30-day range. */
  setT(d: Date): void;
  stepT(deltaMs: number): void;
  setNow(): void;
  setScenarios(s: Scenario[]): void;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ViewState>(() => decodeState(window.location.search, new Date()));

  // Keep the URL in step with the state. Debounced: Safari limits history.replaceState calls.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const url = `${window.location.pathname}?${encodeState(view)}${window.location.hash}`;
      window.history.replaceState(null, '', url);
    }, 250);
    return () => window.clearTimeout(id);
  }, [view]);

  const selectSite = useCallback((id: string) => {
    if (getSite(id)) setView((v) => ({ ...v, siteId: id, custom: null }));
  }, []);
  const setCustom = useCallback((latDeg: number, lonDeg: number) => {
    setView((v) => ({ ...v, custom: { latDeg, lonDeg } }));
  }, []);
  const setRangeStart = useCallback((d: Date) => {
    setView((v) => ({ ...v, ...setRangeStartRule(d) }));
  }, []);
  const setT = useCallback((d: Date) => {
    setView((v) => ({ ...v, ...setTRule(v, d) }));
  }, []);
  const step = useCallback((deltaMs: number) => {
    setView((v) => ({ ...v, ...stepT(v, deltaMs) }));
  }, []);
  const setNow = useCallback(() => {
    setView((v) => ({ ...v, ...setRangeStartRule(roundToHour(new Date())) }));
  }, []);
  const setScenarios = useCallback((scenarios: Scenario[]) => {
    setView((v) => ({ ...v, scenarios }));
  }, []);

  const value = useMemo<AppState>(() => {
    const site = view.custom ? null : (getSite(view.siteId) ?? null);
    const geo = view.custom
      ? { latDeg: view.custom.latDeg, lonDeg: view.custom.lonDeg }
      : siteGeo(site ?? { lat: 0, lon: 0 });
    return {
      site,
      isCustom: view.custom !== null,
      siteGeo: geo,
      siteName: view.custom ? 'Custom coordinates' : (site?.name ?? view.siteId),
      siteKey: view.custom ? `custom:${geo.latDeg},${geo.lonDeg}` : view.siteId,
      rangeStart: view.rangeStart,
      t: view.t,
      scenarios: view.scenarios,
      selectSite,
      setCustom,
      setRangeStart,
      setT,
      stepT: step,
      setNow,
      setScenarios,
    };
  }, [view, selectSite, setCustom, setRangeStart, setT, step, setNow, setScenarios]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState must be used inside AppStateProvider');
  return v;
}

