// Public entry of the 3D hero. three is only reached through Hero3D's dynamic import of ./scene.
export { Hero3D, type Hero3DProps, type Hero3DFallbackReason } from './Hero3D';
export { Hero3DControls, type Hero3DControlsProps } from './Hero3DControls';
export type { SafeArea } from './camera';
export { describeNow, canvasLabel } from './describeNow';
