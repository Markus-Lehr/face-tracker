export const ARKIT_BLENDSHAPE_NAMES = [
  'browDownLeft',
  'browDownRight',
  'browInnerUp',
  'browOuterUpLeft',
  'browOuterUpRight',
  'cheekPuff',
  'cheekSquintLeft',
  'cheekSquintRight',
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'eyeLookDownLeft',
  'eyeLookDownRight',
  'eyeLookInLeft',
  'eyeLookInRight',
  'eyeLookOutLeft',
  'eyeLookOutRight',
  'eyeLookUpLeft',
  'eyeLookUpRight',
  'eyeSquintLeft',
  'eyeSquintRight',
  'eyeWideLeft',
  'eyeWideRight',
  'jawForward',
  'jawLeft',
  'jawOpen',
  'jawRight',
  'mouthClose',
  'mouthDimpleLeft',
  'mouthDimpleRight',
  'mouthFrownLeft',
  'mouthFrownRight',
  'mouthFunnel',
  'mouthLeft',
  'mouthLowerDownLeft',
  'mouthLowerDownRight',
  'mouthPressLeft',
  'mouthPressRight',
  'mouthPucker',
  'mouthRight',
  'mouthRollLower',
  'mouthRollUpper',
  'mouthShrugLower',
  'mouthShrugUpper',
  'mouthSmileLeft',
  'mouthSmileRight',
  'mouthStretchLeft',
  'mouthStretchRight',
  'mouthUpperUpLeft',
  'mouthUpperUpRight',
  'noseSneerLeft',
  'noseSneerRight',
  'tongueOut'
] as const;

export type ARKitBlendshapeName = typeof ARKIT_BLENDSHAPE_NAMES[number];

/**
 * Normalizes MediaPipe face blendshape categories to an array of 52 weights
 * matching ARKIT_BLENDSHAPE_NAMES order.
 */
export function extractARKitWeights(
  categories: Array<{ categoryName: string; score: number }>
): number[] {
  const map = new Map<string, number>();
  for (const cat of categories) {
    map.set(cat.categoryName, Math.max(0, Math.min(1, cat.score)));
  }

  return ARKIT_BLENDSHAPE_NAMES.map(name => {
    // Some categories might have slightly different casing or prefixes
    const val = map.get(name) ?? map.get(`_${name}`) ?? 0;
    return Number(val.toFixed(4));
  });
}
