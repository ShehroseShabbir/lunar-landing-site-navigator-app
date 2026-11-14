import { useCallback, useEffect, useState } from 'react';
import { joinHash, splitHash } from '../Compare/route';

export function isRankHash(hash: string): boolean {
  return splitHash(hash).path === 'rank';
}

/** The hash that opens or closes the rank drawer, keeping other hash params. */
export function hashWithRank(hash: string, open: boolean): string {
  return joinHash(open ? 'rank' : '', splitHash(hash).params);
}

let pushedByOpen = false;

/** Rank drawer state synced with the hash: `#/rank` is open. Opening adds a history entry, so Back closes it. */
export function useRankDrawer(): { open: boolean; setOpen: (open: boolean) => void } {
  const [open, setOpenState] = useState(() => isRankHash(window.location.hash));
  useEffect(() => {
    const on = () => {
      const o = isRankHash(window.location.hash);
      if (!o) pushedByOpen = false;
      setOpenState(o);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const setOpen = useCallback((next: boolean) => {
    const hash = hashWithRank(window.location.hash, next);
    if (next) {
      if (window.location.hash !== hash) pushedByOpen = true;
      window.location.hash = hash;
    } else if (pushedByOpen) {
      pushedByOpen = false;
      window.history.back();
    } else if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  }, []);
  return { open, setOpen };
}
