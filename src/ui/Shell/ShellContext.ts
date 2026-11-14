import { createContext, useContext } from 'react';

export type SheetSnap = 'peek' | 'half' | 'full';

export interface ShellState {
  isPhone: boolean;
  /** Desktop only: panel collapsed to the 40 px rail. */
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  /** Planner details open: panel is 440 px. */
  wide: boolean;
  /** Visible panel width in px on desktop (0 on phone). B2 uses it for the camera offset. */
  panelWidth: number;
  snap: SheetSnap;
  setSnap: (s: SheetSnap) => void;
}

export const ShellContext = createContext<ShellState>({
  isPhone: false,
  collapsed: false,
  setCollapsed: () => {},
  wide: false,
  panelWidth: 304,
  snap: 'half',
  setSnap: () => {},
});

export function useShell(): ShellState {
  return useContext(ShellContext);
}
