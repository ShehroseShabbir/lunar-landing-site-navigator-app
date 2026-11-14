// User-facing strings for the Planner details tab (visual-spec v5, frame A2).
export const DETAILS_COPY = {
  tabLabel: 'Planner details',
  panelLabel: 'Planner details',
  settingsTitle: 'Settings',
  windowStart: '30 days starting (UTC)',
  windowStartHelp: 'Setting this restarts the 30 days and moves the time to the start.',
  stepsLabel: 'Step',
  stepMinusDay: '−1 d',
  stepMinusHour: '−1 h',
  stepPlusHour: '+1 h',
  stepPlusDay: '+1 d',
  stepLabels: {
    '-1d': 'Step back 1 day',
    '-1h': 'Step back 1 hour',
    '+1h': 'Step forward 1 hour',
    '+1d': 'Step forward 1 day',
  },
  playbackTitle: 'Playback speed',
  skyAnglesNote:
    'Sky angles ×3 is a toggle in the view’s icon column. Off (the default) shows true angles; on triples elevations so low bodies are easier to see.',
  thresholdNote:
    'Power OK: at least half the Sun is above the terrain. Comms OK: Earth’s centre is at least 0.5° above the terrain. These are geometry checks, not power or link budgets.',
  starNote: 'Stars in the 3D view are decoration, not a star map.',
  smoothMoonNote: 'Smooth-Moon horizon, terrain not included.',
  terrainNote: 'The horizon comes from LOLA elevation data (see About the data for resolution and limits).',
  whyTitle: 'Why?',
  whyLabel: 'Explanations',
  validationTitle: 'How accurate is it?',
  validationPending: 'Validation results pending.',
  validationAnswer: (t: { maxErrDeg: string; checks: string }) => `Within ${t.maxErrDeg} of JPL Horizons (${t.checks} checks).`,
  validation: (t: { pointsPerBody: string; sites: string; generatedAt: string; maxElErrDeg: string; maxAzCosElErrDeg: string }) =>
    `Checked against airless JPL Horizons output: ${t.pointsPerBody} times per body at ${t.sites}, ${t.generatedAt}. Largest elevation difference: ${t.maxElErrDeg}. Largest azimuth difference × cos(elevation): ${t.maxAzCosElErrDeg}.`,
  rowsFallbackTitle: 'Sun and Earth',
  shareTitle: 'Share',
} as const;
