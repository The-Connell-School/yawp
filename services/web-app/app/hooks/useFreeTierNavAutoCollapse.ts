import { useEffect, useRef } from 'react';
import { useFetcher } from 'react-router';
import { shouldAutoCollapseFreeTierNavOnResize } from '~/domain/free-tier/free-tier-nav-auto-collapse';
import { useRequestInfo } from '~/hooks/useRequestInfo';
import { useNavState } from '~/routes/api.preferences.nav/route';

const navPreferencePath = '/api/preferences/nav';

type NavCollapseSubmit = (
  data: { state: 'collapsed' },
  options: { method: 'POST'; action: string }
) => unknown;

/**
 * Posts a collapsed nav preference when the viewport enters the narrow band.
 * The first observation of a page load is not an entry, so a saved preference
 * is left alone until the width actually crosses into the band.
 */
export function useFreeTierNavCollapseEffect({
  enabled,
  navExpanded,
  navPreferenceExplicit,
  fetcherState,
  submit,
}: {
  enabled: boolean;
  navExpanded: boolean;
  navPreferenceExplicit: boolean;
  fetcherState: string;
  submit: NavCollapseSubmit;
}) {
  const inNarrowBandRef = useRef<boolean | null>(null);
  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    if (!enabled) return;

    const sync = () => {
      const { collapse, inNarrowBand } = shouldAutoCollapseFreeTierNavOnResize({
        viewportWidth: window.innerWidth,
        wasInNarrowBand: inNarrowBandRef.current,
        navExpanded,
        navPreferenceExplicit,
      });
      inNarrowBandRef.current = inNarrowBand;

      if (collapse && fetcherState === 'idle') {
        void submitRef.current(
          { state: 'collapsed' },
          { method: 'POST', action: navPreferencePath }
        );
      }
    };

    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [enabled, fetcherState, navExpanded, navPreferenceExplicit]);
}

export function useFreeTierNavAutoCollapse(enabled: boolean) {
  const navState = useNavState();
  const requestInfo = useRequestInfo();
  const fetcher = useFetcher();
  useFreeTierNavCollapseEffect({
    enabled,
    navExpanded: navState === 'expanded',
    navPreferenceExplicit:
      requestInfo.userPrefs.navPreferenceExplicit === true,
    fetcherState: fetcher.state,
    submit: (data, options) => fetcher.submit(data, options),
  });
}
