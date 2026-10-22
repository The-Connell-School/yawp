import { transactionalEmailPublicOrigin } from './public-origin.server';

export function plainTextEmailFooter(whyYouGotThis: string, origin?: string) {
  const site = (origin ?? transactionalEmailPublicOrigin()).replace(/\/$/, '');
  return `--\nSent by Yawp! · ${site}\n${whyYouGotThis}\nQuestions? support@yawp.school`;
}

export function plainTextButton(label: string, url: string) {
  return `${label}:\n${url}`;
}
