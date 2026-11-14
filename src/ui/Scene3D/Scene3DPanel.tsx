import { lazy, Suspense, useId } from 'react';
import './Scene3D.css';

// The only import of the three-based module: a dynamic one, so three stays out of the first-paint bundle.
const Scene3D = lazy(() => import('./Scene3D'));

export const PANEL_ID = 'scene3d-panel';

export interface Scene3DToggleProps {
  open: boolean;
  onToggle(): void;
}

/** Header button ("3D terrain"). The parent owns `open` and renders Scene3DPanel only when it is true. */
export function Scene3DToggle({ open, onToggle }: Scene3DToggleProps) {
  return (
    <button type="button" className="s3d-toggle" aria-expanded={open} aria-controls={PANEL_ID} onClick={onToggle}>
      3D terrain
    </button>
  );
}

export function Scene3DPanel() {
  const headingId = useId();
  return (
    <section id={PANEL_ID} className="s3d-panel" aria-labelledby={headingId}>
      <h2 id={headingId}>3D terrain</h2>
      <Suspense fallback={<p className="s3d-note">Loading 3D view...</p>}>
        <Scene3D />
      </Suspense>
    </section>
  );
}
