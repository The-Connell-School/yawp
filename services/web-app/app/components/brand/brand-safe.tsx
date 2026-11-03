/**
 * Text that may sit in capitals (an eyebrow, a kicker) with the name kept
 * as Yawp!: the name opts out of `text-transform: uppercase`.
 */
import type { ReactNode } from 'react';
import { brandParts } from '~/domain/brand';

export function BrandSafe({ children }: { children: ReactNode }) {
  if (typeof children !== 'string') return <>{children}</>;
  return (
    <>
      {brandParts(children).map((part, index) =>
        part.brand ? (
          <span key={index} style={{ textTransform: 'none' }}>
            {part.text}
          </span>
        ) : (
          part.text
        )
      )}
    </>
  );
}
