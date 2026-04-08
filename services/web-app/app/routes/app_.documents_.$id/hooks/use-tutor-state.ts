import { useCallback, useEffect, useState } from 'react';

export type TutorCms = {
  id: string;
  messages: Array<{
    id: string;
    agent: string;
    content: string;
    createdAt?: string | Date;
  }>;
  // Other CMS fields as needed by the UI — opaque to this hook
  [key: string]: any;
};

/**
 * Local state owner for the tutor's CMS data. The route's loader provides
 * the initial CMS; child components (Tutor, etc.) call updateCms with the
 * new state after server mutations. Replaces the ?spa=1 revalidation pattern.
 */
export function useTutorState(initialCms: TutorCms | null) {
  const [cms, setCms] = useState<TutorCms | null>(initialCms);

  // Resync if the loader-provided CMS changes (e.g., navigating to a different
  // document loads a different CMS). For most interactions in a single doc
  // session, this won't fire.
  useEffect(() => {
    setCms(initialCms);
  }, [initialCms?.id]);

  const updateCms = useCallback((next: TutorCms) => {
    setCms(next);
  }, []);

  return { cms, updateCms };
}
