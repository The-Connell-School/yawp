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
 *
 * `cmsIdx` must match the loader's `?cmsIdx=` so we resync when the user moves
 * between sessions: after advancing client-side, `initialCms?.id` can match the
 * stale loader id while the URL index points at a different session.
 */
export function useTutorState(initialCms: TutorCms | null, cmsIdx = 0) {
  const [cms, setCms] = useState<TutorCms | null>(initialCms);

  useEffect(() => {
    setCms(initialCms);
  }, [initialCms?.id, cmsIdx]);

  const updateCms = useCallback((next: TutorCms) => {
    setCms(next);
  }, []);

  return { cms, updateCms };
}
