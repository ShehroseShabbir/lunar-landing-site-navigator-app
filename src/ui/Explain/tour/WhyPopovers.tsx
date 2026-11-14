import { Explain, EXPLAIN_COPY } from '../Explain';

/** One-line anchors for the "Why?" popovers W1-W4 and W8 (prep/tour-copy.md section 1). */
export const WhySunLow = () => <Explain copy={EXPLAIN_COPY.W1} />;
export const WhyEarthBobs = () => <Explain copy={EXPLAIN_COPY.W2} />;
export const WhyTerrain = () => <Explain copy={EXPLAIN_COPY.W3} />;
export const WhySunsetSudden = () => <Explain copy={EXPLAIN_COPY.W4} />;
export const WhyUtc = () => <Explain copy={EXPLAIN_COPY.W8} />;
