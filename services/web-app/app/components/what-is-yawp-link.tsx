export const WHAT_IS_YAWP_HREF = 'https://yawpwritingprogram.com';
export const WHAT_IS_YAWP_LABEL = 'What is Yawp!';

export function WhatIsYawpLink({ className }: { className?: string }) {
  return (
    <a
      href={WHAT_IS_YAWP_HREF}
      target="_blank"
      rel="noopener"
      className={className}
    >
      {WHAT_IS_YAWP_LABEL}
    </a>
  );
}
