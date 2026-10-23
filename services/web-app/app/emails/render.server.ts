import { renderAsync } from '@react-email/components';
import type { ReactElement } from 'react';

export async function renderTransactionalEmail(
  element: ReactElement,
  text: string
) {
  const html = await renderAsync(element);
  return { html, text };
}
