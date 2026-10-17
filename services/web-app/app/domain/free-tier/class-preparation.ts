export const CLASS_GRADES = ['9', '10', '11', '12', 'mixed'] as const;
export const MAX_CLASS_NAME = 100;

export function classGradePrefill(value: string | null | undefined): string {
  return CLASS_GRADES.includes(value as (typeof CLASS_GRADES)[number])
    ? value!
    : '';
}

export function parseClassPreparation(className: string, grade: string) {
  const name = className.trim();
  const errors = {
    className:
      !name ||
      name.length > MAX_CLASS_NAME ||
      /[\u0000-\u001f\u007f]/.test(className)
        ? 'Enter a class name with 1–100 characters.'
        : undefined,
    grade: !classGradePrefill(grade)
      ? 'Choose 9, 10, 11, 12, or mixed grades.'
      : undefined,
  };
  if (errors.className || errors.grade) return { ok: false as const, errors };
  return { ok: true as const, className: name, grade };
}

export function needsClassPreparation(
  app: {
    status: string;
    starterClassName?: string | null;
    starterClassGrade?: string | null;
  } | null,
  enabled: boolean
) {
  return (
    enabled &&
    app?.status === 'ACCOUNT_CREATED' &&
    !parseClassPreparation(
      app.starterClassName ?? '',
      app.starterClassGrade ?? ''
    ).ok
  );
}
