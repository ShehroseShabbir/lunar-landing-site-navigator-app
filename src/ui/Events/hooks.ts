// Trigger matches for the current 30-day window, computed in the worker and memoised by (site, start, rule).
import { useEffect, useMemo, useState } from 'react';
import type { HorizonProfile } from '../../astro/types';
import { loadHorizon } from '../../data/horizons';
import { useAppState } from '../../state/AppState';
import type { TriggerMatch, TriggerRule } from '../../state/events.types';
import { rangeEnd } from '../../state/time';
import { createFinderClient } from './finderClient';
import { matchLasts, openingStamp, ruleKey } from './logic';
import { keepRulesInUrl, useRules } from './store';

export interface RuleMatches {
  status: 'loading' | 'ready' | 'error';
  matches: TriggerMatch[];
}

const evalClient = createFinderClient();
const results = new Map<string, RuleMatches>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const MAX_CACHE = 60;

/** Loads the terrain profile for the active site (null for custom sites or sites without terrain). */
export function useProfile(): { loading: boolean; profile: HorizonProfile | null } {
  const { site, isCustom } = useAppState();
  const id = isCustom ? null : (site?.id ?? null);
  const [state, setState] = useState<{ id: string | null; profile: HorizonProfile | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    loadHorizon(id)
      .then((profile) => live && setState({ id, profile }))
      .catch(() => live && setState({ id, profile: null }));
    return () => {
      live = false;
    };
  }, [id]);
  if (!id) return { loading: false, profile: null };
  if (state?.id !== id) return { loading: true, profile: null };
  return { loading: false, profile: state.profile };
}

/** Matches of each rule over the current 30-day window. Non-blocking: results fill in as the worker answers. */
export function useRuleMatches(rules: TriggerRule[]): Record<string, RuleMatches> {
  const { siteKey, siteGeo, rangeStart } = useAppState();
  const { loading, profile } = useProfile();
  const [version, bump] = useState(0);
  const startMs = rangeStart.getTime();
  const keys = rules.map((r) => `${siteKey}|${startMs}|${ruleKey(r)}`).join(',');

  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);

  useEffect(() => {
    if (loading) return;
    const from = new Date(startMs);
    const to = rangeEnd(from);
    const cancels: (() => void)[] = [];
    const started: string[] = [];
    // Debounce: typing in the editor changes the key on every keystroke.
    const h = window.setTimeout(() => {
      for (const rule of rules) {
        const key = `${siteKey}|${startMs}|${ruleKey(rule)}`;
        if (results.has(key)) continue;
        if (results.size >= MAX_CACHE) results.delete(results.keys().next().value as string);
        results.set(key, { status: 'loading', matches: [] });
        started.push(key);
        cancels.push(
          evalClient.run({ op: 'evaluate', rule, site: siteGeo, profile, from, to }, (r) => {
            results.set(key, r.ok ? { status: 'ready', matches: r.matches } : { status: 'error', matches: [] });
            notify();
          }),
        );
      }
      notify();
    }, 200);
    return () => {
      window.clearTimeout(h);
      for (const c of cancels) c();
      for (const k of started) if (results.get(k)?.status === 'loading') results.delete(k);
    };
    // keys encodes every rule condition; rules itself changes identity per render of callers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, siteGeo, profile, loading]);

  return useMemo(() => {
    const out: Record<string, RuleMatches> = {};
    for (const r of rules) {
      out[r.id] = results.get(`${siteKey}|${startMs}|${ruleKey(r)}`) ?? { status: 'loading', matches: [] };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, version]);
}

export interface TriggerHighlights {
  /** Matched ranges per rule id, as [startMs, endMs] pairs. */
  rangesByRule: Record<string, [number, number][]>;
  /** CSS colour for the highlight outline. */
  color: string;
  /** Plain-text alternative for the highlight (each rule's matches). */
  summary: string;
}

/** For the time dock: call once in an always-mounted component and pass the result to <TriggerOverlay/>. Also keeps `rules=` in the URL. */
export function useTriggerHighlights(): TriggerHighlights {
  const { rules } = useRules();
  const { t, rangeStart, siteKey } = useAppState();
  const matches = useRuleMatches(rules);

  // AppState rewrites the query on every view change; put `rules=` back afterwards.
  useEffect(() => {
    keepRulesInUrl();
  }, [t, rangeStart, siteKey]);

  return useMemo(() => {
    const rangesByRule: Record<string, [number, number][]> = {};
    const parts: string[] = [];
    for (const r of rules) {
      const m = matches[r.id]?.matches ?? [];
      rangesByRule[r.id] = m.map((x) => [x.start.getTime(), x.end.getTime()]);
      parts.push(
        `${r.name}: ${
          m.length === 0
            ? 'no matches'
            : m
                .map((x) =>
                  x.clippedStart
                    ? `already open at ${openingStamp(x.start)} for at least ${matchLasts(x)}`
                    : `opens ${openingStamp(x.start)} for ${matchLasts(x)}${x.clippedEnd ? ' or longer' : ''}`,
                )
                .join('; ')
        }`,
      );
    }
    return { rangesByRule, color: 'var(--both)', summary: parts.join('. ') };
  }, [rules, matches]);
}
