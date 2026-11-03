import { useEffect, useState, type CSSProperties } from 'react';

/** Keeps a fixed footer aligned with the visual viewport (on-screen keyboard). */
export function useVisualViewportFooterStyle(enabled: boolean) {
  const [style, setStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      const gap = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop
      );
      setStyle({
        transform: gap ? `translateY(-${gap}px)` : undefined,
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
      });
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [enabled]);

  return style;
}
