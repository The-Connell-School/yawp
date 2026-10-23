import { useOutletContext } from 'react-router';

/** Loader context for /free/* — pass1 admin copy follows the free-tier flag only. */
export type FreeTierLayoutContext = {
  freeTierEnabled: boolean;
};

export function useFreeTierEnabled() {
  return useOutletContext<FreeTierLayoutContext>()?.freeTierEnabled ?? false;
}
