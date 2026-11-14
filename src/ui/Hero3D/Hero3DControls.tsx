import { useEffect, useState, type ReactNode } from 'react';
import { COPY } from './copy';

export interface Hero3DControlsProps {
  onZoomIn(): void;
  onZoomOut(): void;
  onReset(): void;
  skyX3: boolean;
  onSkyX3Change(on: boolean): void;
  panorama: boolean;
  onPanoramaChange(on: boolean): void;
  /** Zoom, reset and sky heights act on the 3D view only; off while it is not shown. */
  viewDisabled?: boolean;
  /** The 2D view is the only view (no WebGL or no terrain): the toggle stays pressed and disabled. */
  panoramaLocked?: boolean;
  className?: string;
}

const svg = (children: ReactNode) => (
  <svg className="h3d-ic" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    {children}
  </svg>
);

const ICONS = {
  plus: svg(<path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />),
  minus: svg(<path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />),
  reset: svg(
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3.2 8a4.8 4.8 0 1 0 1.4-3.4" />
      <path d="M3.5 2.2v2.8h2.8" />
    </g>,
  ),
  angle: svg(
    <>
      <path d="M2 13.5h12M2 13.5 12 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7 13.5a5 5 0 0 0-1.2-3.3" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </>,
  ),
  sky2d: svg(
    <>
      <path d="M1.5 11.5l3-3 2.5 2 3-4 4.5 5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M1.5 13.5h13" stroke="currentColor" strokeWidth="1.4" />
    </>,
  ),
  full: svg(
    <path
      d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />,
  ),
};

interface IconButtonProps {
  label: string;
  icon: ReactNode;
  onClick(): void;
  pressed?: boolean;
  disabled?: boolean;
}

/** Icon button whose tooltip equals its aria-label (copy-v5.1); toggles use aria-pressed. */
function IconButton({ label, icon, onClick, pressed, disabled }: IconButtonProps) {
  return (
    <button
      type="button"
      className="h3d-ibtn"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span className="h3d-tip" aria-hidden="true">
        {label}
      </span>
    </button>
  );
}

function useFullscreen(): { supported: boolean; on: boolean; toggle(): void } {
  const supported = typeof document !== 'undefined' && document.fullscreenEnabled === true;
  const [on, setOn] = useState(() => typeof document !== 'undefined' && document.fullscreenElement !== null);
  useEffect(() => {
    const sync = () => setOn(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };
  return { supported, on, toggle };
}

/** The icon column (bottom-right): zoom, reset, sky heights ×3, 2D sky view, full screen. */
export function Hero3DControls(p: Hero3DControlsProps) {
  const fs = useFullscreen();
  // Esc dismisses an open tooltip (WCAG 1.4.13); it returns on the next pointer move or focus change.
  const [tipsOff, setTipsOff] = useState(false);
  return (
    <div
      className={`h3d-icons ${p.className ?? ''}`}
      data-tips-off={tipsOff ? 'true' : 'false'}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setTipsOff(true);
      }}
      onPointerMove={() => tipsOff && setTipsOff(false)}
      onFocus={() => tipsOff && setTipsOff(false)}
      role="toolbar" aria-label={COPY.toolbar} aria-orientation="vertical">
      <IconButton label={COPY.zoomIn} icon={ICONS.plus} onClick={p.onZoomIn} disabled={p.viewDisabled} />
      <IconButton label={COPY.zoomOut} icon={ICONS.minus} onClick={p.onZoomOut} disabled={p.viewDisabled} />
      <IconButton label={COPY.reset} icon={ICONS.reset} onClick={p.onReset} disabled={p.viewDisabled} />
      <IconButton
        label={COPY.skyX3}
        icon={ICONS.angle}
        pressed={p.skyX3}
        onClick={() => p.onSkyX3Change(!p.skyX3)}
        disabled={p.viewDisabled}
      />
      <IconButton
        label={COPY.panorama}
        icon={ICONS.sky2d}
        pressed={p.panorama}
        onClick={() => p.onPanoramaChange(!p.panorama)}
        disabled={p.panoramaLocked}
      />
      {fs.supported && <IconButton label={COPY.fullscreen} icon={ICONS.full} pressed={fs.on} onClick={fs.toggle} />}
    </div>
  );
}
