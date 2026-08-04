export const CLASS_CARD_GRADIENT_KEYS = [
  'indigo-purple-pink',
  'cyan-blue-indigo',
  'amber-orange-rose',
  'emerald-teal-cyan',
  'violet-fuchsia-amber',
  'rose-red-orange',
] as const;

export type ClassCardGradientKey = (typeof CLASS_CARD_GRADIENT_KEYS)[number];

export const CLASS_CARD_GRADIENT_CLASSES: Record<ClassCardGradientKey, string> =
  {
    'indigo-purple-pink':
      'bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-400',
    'cyan-blue-indigo':
      'bg-gradient-to-br from-cyan-500 via-blue-500 to-indigo-400',
    'amber-orange-rose':
      'bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500',
    'emerald-teal-cyan':
      'bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500',
    'violet-fuchsia-amber':
      'bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-300',
    'rose-red-orange':
      'bg-gradient-to-br from-rose-400 via-red-500 to-orange-400',
  };

export function isClassCardGradientKey(
  value: string | null | undefined
): value is ClassCardGradientKey {
  return (
    typeof value === 'string' &&
    CLASS_CARD_GRADIENT_KEYS.includes(value as ClassCardGradientKey)
  );
}

export function generateClassCardGradientKey(
  seed: string
): ClassCardGradientKey {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash =
      (hash + seed.charCodeAt(i) * (i + 1)) % CLASS_CARD_GRADIENT_KEYS.length;
  }
  return CLASS_CARD_GRADIENT_KEYS[hash];
}

export function classCardGradientClass(
  key: string | null | undefined,
  fallbackSeed?: string
): string {
  if (isClassCardGradientKey(key)) {
    return CLASS_CARD_GRADIENT_CLASSES[key];
  }

  if (fallbackSeed) {
    return CLASS_CARD_GRADIENT_CLASSES[
      generateClassCardGradientKey(fallbackSeed)
    ];
  }

  return CLASS_CARD_GRADIENT_CLASSES['indigo-purple-pink'];
}
