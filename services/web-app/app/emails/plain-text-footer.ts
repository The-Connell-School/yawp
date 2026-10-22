export function defaultTransactionalEmailOrigin() {
  const primary =
    typeof process !== 'undefined'
      ? process.env.PRIMARY_APP_URL?.trim()
      : undefined;
  if (primary) return primary.replace(/\/$/, '');
  return 'https://yawp.school';
}

export function plainTextEmailFooter(whyYouGotThis: string, origin?: string) {
  const site = (origin ?? defaultTransactionalEmailOrigin()).replace(/\/$/, '');
  return `--\nSent by Yawp! · ${site}\n${whyYouGotThis}\nQuestions? support@yawp.school`;
}

export function plainTextButton(label: string, url: string) {
  return `${label}:\n${url}`;
}
