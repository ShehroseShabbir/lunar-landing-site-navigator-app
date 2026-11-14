// Saved triggers: a tiny external store (shared by the Events tab and the time-dock overlay),
// persisted in the page URL as `&rules=`. AppState rewrites the query string on every change and
// knows nothing about `rules`, so this module puts it back after each rewrite (see reapplyRulesToUrl).
import { useSyncExternalStore } from 'react';
import type { TriggerRule } from '../../state/events.types';
import { MAX_RULES, rulesFromSearch, searchWithRules } from './logic';

interface Snapshot {
  rules: TriggerRule[];
  selectedId: string | null;
}

let snap: Snapshot | null = null;
const listeners = new Set<() => void>();

function get(): Snapshot {
  if (!snap) {
    const rules = typeof window === 'undefined' ? [] : rulesFromSearch(window.location.search);
    snap = { rules, selectedId: rules[0]?.id ?? null };
  }
  return snap;
}

function set(next: Snapshot) {
  snap = next;
  for (const l of listeners) l();
  scheduleUrl(320);
}

let timer: number | undefined;
function scheduleUrl(ms: number) {
  if (typeof window === 'undefined') return;
  window.clearTimeout(timer);
  timer = window.setTimeout(reapplyRulesToUrl, ms);
}

/** Writes the saved rules into the address bar, keeping everything else. Safe to call repeatedly. */
export function reapplyRulesToUrl() {
  const { rules } = get();
  const current = window.location.search.replace(/^\?/, '');
  const next = searchWithRules(current, rules);
  if (next === current) return;
  window.history.replaceState(null, '', `${window.location.pathname}?${next}${window.location.hash}`);
}

/** Call after AppState changes (its URL write is debounced 250 ms) so `rules=` survives. */
export function keepRulesInUrl() {
  if (get().rules.length > 0) scheduleUrl(320);
}

export const rulesStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  getSnapshot: get,
  add(rule: TriggerRule): boolean {
    const s = get();
    if (s.rules.length >= MAX_RULES) return false;
    set({ rules: [...s.rules, rule], selectedId: rule.id });
    return true;
  },
  update(id: string, patch: Partial<TriggerRule>) {
    const s = get();
    set({ ...s, rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  },
  /** Replaces a rule outright (so optional fields can be cleared). */
  replace(rule: TriggerRule) {
    const s = get();
    set({ ...s, rules: s.rules.map((r) => (r.id === rule.id ? rule : r)) });
  },
  remove(id: string) {
    const s = get();
    const rules = s.rules.filter((r) => r.id !== id);
    set({ rules, selectedId: s.selectedId === id ? (rules[0]?.id ?? null) : s.selectedId });
  },
  select(id: string) {
    set({ ...get(), selectedId: id });
  },
};

export function useRules(): Snapshot {
  return useSyncExternalStore(rulesStore.subscribe, rulesStore.getSnapshot, rulesStore.getSnapshot);
}
