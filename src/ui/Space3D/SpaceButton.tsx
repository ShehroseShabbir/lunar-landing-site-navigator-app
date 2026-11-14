// "View from space": an icon button for the 3D view's icon column (same look as its other buttons;
// the tooltip equals the aria-label, copy-v5.1). Also exports the stage switch hook.

import { useCallback, useEffect, useRef, useState } from 'react';
import { COPY } from './copy';

export interface SpaceButtonProps {
  onClick(): void;
  disabled?: boolean;
  className?: string;
  /** Focus the button on mount (on the way back from the space view, so focus is not lost). */
  autoFocus?: boolean;
}

export function SpaceButton({ onClick, disabled, className, autoFocus }: SpaceButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <button ref={ref} type="button" className={`h3d-ibtn ${className ?? ''}`} aria-label={COPY.viewFromSpace} disabled={disabled} onClick={onClick}>
      <svg className="h3d-ic" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <ellipse cx="8" cy="8" rx="6.8" ry="2.6" fill="none" stroke="currentColor" strokeWidth="1.1" transform="rotate(-20 8 8)" />
      </svg>
      <span className="h3d-tip" aria-hidden="true">
        {COPY.viewFromSpace}
      </span>
    </button>
  );
}

export type Stage = 'surface' | 'space';

/**
 * Which view fills the stage: the surface (Hero3D) or space (Space3D). `returnedFromSpace` is true
 * after showSurface, so the remounted "View from space" button can take focus.
 */
export function useSpaceStage(initial: Stage = 'surface') {
  const [stage, setStage] = useState<Stage>(initial);
  const [returnedFromSpace, setReturned] = useState(false);
  const showSpace = useCallback(() => {
    setReturned(false);
    setStage('space');
  }, []);
  const showSurface = useCallback(() => {
    setReturned(true);
    setStage('surface');
  }, []);
  return { stage, showSpace, showSurface, returnedFromSpace };
}
