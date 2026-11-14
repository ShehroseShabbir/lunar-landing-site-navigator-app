import { useEffect, useRef, useState } from "react";
import type {
  HorizonProfile,
  ScanResult,
  SiteGeo,
  SiteMetrics,
} from "../astro/types";
import { loadHorizon } from "../data/horizons";
import { useAppState } from "./AppState";
import {
  compute,
  createProfileCache,
  reviveDates,
  scanKey,
} from "./scenarioCache";
import type { WorkerRequest } from "./scenario.worker";

export interface ScenarioInput {
  siteGeo: SiteGeo;
  siteId: string | null;
  rangeStart: Date;
  t: Date;
}

export interface ScenarioResult {
  status: "loading" | "ready" | "error";
  error?: string;
  profile: HorizonProfile | null;
  hasTerrain: boolean;
  /** 'loading' while the horizon file loads, 'none' for custom sites or no terrain file. */
  terrain: "loading" | "loaded" | "none";
  /** Re-runs a failed load or scan. */
  retry(): void;
  scan: ScanResult | null;
  metrics: SiteMetrics | null;
}

type Reply =
  | { id: number; ok: true; metrics: SiteMetrics; scan?: ScanResult }
  | { id: number; ok: false; error: string };

const profiles = createProfileCache(loadHorizon);
const sentProfiles = new Set<string>();
const pending = new Map<number, (r: Reply) => void>();
let worker: Worker | null | undefined;
let nextId = 1;
let nextOwner = 1;

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const w = new Worker(new URL("./scenario.worker.ts", import.meta.url), {
      type: "module",
    });
    w.onmessage = (e: MessageEvent<Reply>) => {
      const cb = pending.get(e.data.id);
      pending.delete(e.data.id);
      cb?.(reviveDates(e.data));
    };
    w.onerror = () => {
      // Worker unusable: report to waiting callers; later runs fall back to the main thread.
      worker = null;
      for (const [id, cb] of pending)
        cb({
          id,
          ok: false,
          error: "Background calculation failed. Reload to retry.",
        });
      pending.clear();
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

function run(
  owner: number,
  input: ScenarioInput,
  profile: HorizonProfile | null,
  needScan: boolean,
  done: (r: Reply) => void,
) {
  const id = nextId++;
  const w = getWorker();
  if (w) {
    pending.set(id, done);
    const req: WorkerRequest = { id, owner, ...input, needScan };
    if (profile && !sentProfiles.has(profile.siteId)) {
      req.profile = profile;
      sentProfiles.add(profile.siteId);
    }
    w.postMessage(req);
    return () => void pending.delete(id);
  }
  // Fallback: defer so the loading state paints first.
  const h = window.setTimeout(() => {
    try {
      done({
        id,
        ok: true,
        ...compute(input.siteGeo, profile, input.rangeStart, input.t, needScan),
      });
    } catch (err) {
      done({
        id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, 0);
  return () => window.clearTimeout(h);
}

/** Scan + metrics for one scenario. Scans run once per (site, rangeStart); moving t only recomputes instant values. */
export function useScenarioResult(input?: ScenarioInput): ScenarioResult {
  const app = useAppState();
  const geo = input?.siteGeo ?? app.siteGeo;
  const siteId = input
    ? input.siteId
    : app.isCustom
      ? null
      : (app.site?.id ?? null);
  const rangeStart = input?.rangeStart ?? app.rangeStart;
  const t = input?.t ?? app.t;
  const key = scanKey(geo, siteId, rangeStart);

  const [profileState, setProfileState] = useState<{
    siteId: string | null;
    profile: HorizonProfile | null;
  } | null>(null);
  const [scanState, setScanState] = useState<{
    key: string;
    scan: ScanResult;
  } | null>(null);
  const [metricsState, setMetricsState] = useState<{
    key: string;
    tMs: number;
    metrics: SiteMetrics;
  } | null>(null);
  const [retryN, setRetryN] = useState(0);
  const owner = useRef(0);
  if (owner.current === 0) owner.current = nextOwner++;
  const [error, setError] = useState<{ key: string; message: string } | null>(
    null,
  );
  const heldKey = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    void profiles.get(siteId).then((profile) => {
      if (live) setProfileState({ siteId, profile });
    });
    return () => {
      live = false;
    };
  }, [siteId, retryN]);

  useEffect(() => {
    const o = owner.current;
    return () => worker?.postMessage({ id: 0, owner: o, release: true });
  }, []);

  const profileReady = profileState !== null && profileState.siteId === siteId;
  const profile = profileReady ? profileState.profile : null;
  const tMs = t.getTime();
  // "Slow" flag: set when the current request has been pending for over 100 ms.
  const [slow, setSlow] = useState(false);
  const waitingFor = `${key}|${scanState?.key ?? ""}`;
  useEffect(() => {
    const sameScan = scanState?.key === key && metricsState?.key === key;
    if (sameScan && metricsState?.tMs === tMs) {
      setSlow(false);
      return;
    }
    if (sameScan) return; // t-only change: never flag as slow
    const id = window.setTimeout(() => setSlow(true), 100);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingFor, tMs, metricsState]);

  useEffect(() => {
    if (!profileReady) return;
    const needScan = heldKey.current !== key;
    return run(
      owner.current,
      { siteGeo: geo, siteId, rangeStart, t: new Date(tMs) },
      profile,
      needScan,
      (r) => {
        if (!r.ok) {
          setError({ key, message: r.error });
          return;
        }
        setError(null);
        if (r.scan) {
          heldKey.current = key;
          setScanState({ key, scan: r.scan });
        }
        setMetricsState({ key, tMs, metrics: r.metrics });
      },
    );
    // geo and rangeStart are covered by key; t by tMs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tMs, profileReady, profile, retryN]);

  const retry = () => {
    heldKey.current = null;
    setError(null);
    setRetryN((n) => n + 1);
  };
  const terrain: ScenarioResult["terrain"] =
    siteId === null
      ? "none"
      : !profileReady
        ? "loading"
        : profile
          ? "loaded"
          : "none";
  // Keep the last values while recalculating (ui-spec 5.1); null only before the first result.
  const base = { profile, hasTerrain: profile !== null, terrain, retry };
  if (error?.key === key) {
    return {
      ...base,
      status: "error",
      error: error.message,
      scan: scanState?.scan ?? null,
      metrics: metricsState?.metrics ?? null,
    };
  }
  const fresh =
    profileReady &&
    scanState?.key === key &&
    metricsState?.key === key &&
    metricsState.tMs === tMs;
  // A t-only change (playhead, playback) keeps the same scan: never show "Updating" for it.
  // Anything else shows "loading" only after a request has been pending for over 100 ms.
  const hasResult = scanState !== null && metricsState !== null;
  const pendingSlow = !fresh && slow;
  return {
    ...base,
    status: fresh ? "ready" : !hasResult || pendingSlow ? "loading" : "ready",
    scan: scanState?.scan ?? null,
    metrics: metricsState?.metrics ?? null,
  };
}
