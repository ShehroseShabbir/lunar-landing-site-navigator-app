// User-facing strings for the sky panorama (v5). Existing wording kept.
export const SKY_COPY = {
  title: 'Sky panorama',
  note: (vScale: string) =>
    `Markers are drawn at least 12 px wide; close-ups show the true size. Terrain is drawn at ×${vScale} vertical scale.`,
} as const;
