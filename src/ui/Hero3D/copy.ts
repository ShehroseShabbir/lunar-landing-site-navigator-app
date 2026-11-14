// Every user-facing string of the 3D hero (prep/mockups/copy-v5.1.md, "3D view labels" and "Icon column").
// Tooltips equal the aria-labels; toggles announce their state with aria-pressed, not text.

export const COPY = {
  sun: 'Sun',
  earth: 'Earth',
  sunState: {
    above: 'above the ridge',
    partly: 'partly above the ridge',
    ridge: 'behind the ridge',
    below: 'below the horizon',
  },
  earthState: {
    inView: 'in view',
    hidden: 'behind the ridge',
    below: 'below the horizon',
  },
  site: 'Landing site',
  sunPath: 'Sun · next 30 days',
  earthPath: 'Earth · next 30 days',
  compass: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const,

  skyX3Chip: 'Sky heights ×3',
  smoothMoonChip: 'Smooth-Moon horizon, terrain not included',
  loading: 'Loading terrain…',
  loadingLabel: (name: string) => `3D view of the terrain around ${name}. Loading terrain…`,
  keysHint: 'Drag, or use the arrow keys, to move around the site. Plus and minus zoom; Home resets the view.',

  noTerrain: 'No 3D terrain for this site yet (only south-pole sites have it). Showing the 2D sky view.',
  noWebgl: "This browser can't show 3D. Showing the 2D sky view.",

  toolbar: 'View controls',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  reset: 'Reset view',
  skyX3: 'Stretch sky heights ×3',
  panorama: 'Show 2D sky view',
  fullscreen: 'Full screen',
} as const;
