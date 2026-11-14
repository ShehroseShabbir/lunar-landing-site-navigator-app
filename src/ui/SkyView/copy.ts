// User-facing strings for the sky panorama (v5). Existing wording kept.
export const SKY_COPY = {
  title: 'Sky panorama',
  note: (vScale: string, hasTerrain: boolean) =>
    `Sun and Earth markers are enlarged so you can see them; the close-ups show true size.${hasTerrain ? ` Heights ×${vScale}.` : ''}`,
} as const;
