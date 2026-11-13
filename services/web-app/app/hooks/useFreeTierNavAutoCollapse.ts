import { useEffect, useRef } from 'react';
import { useFetcher } from 'react-router';
import { shouldAutoCollapseFreeTierNavOnResize } from '~/domain/free-tier/free-tier-nav-auto-collapse';
import { useNavState } from '~/routes/api.preferences.nav/route';

const navPreferencePath = '/api/preferences/nav';

export function useFreeTierNavAutoCollapse(enabled: boolean) {
  const navState = useNavState();
  const fetcher = useFetcher();
  const inNarrowBandRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const sync = () => {
      const { collapse, inNarrowBand } = shouldAutoCollapseFreeTierNavOnResize({
        viewportWidth: window.innerWidth,
        wasInNarrowBand: inNarrowBandRef.current,
        navExpanded: navState === 'expanded',
      });
      inNarrowBandRef.current = inNarrowBand;

      if (collapse && fetcher.state === 'idle') {
        void fetcher.submit(
          { state: 'collapsed' },
          { method: 'POST', action: navPreferencePath }
        );
      }
    };

    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [enabled, fetcher, navState]);
}
