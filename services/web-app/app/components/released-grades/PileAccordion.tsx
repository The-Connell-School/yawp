import { useEffect, useMemo, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import type { Pile } from '~/services/released-grades.server';

type PileSubmissionRow = {
  submissionId: string;
  studentProfileId: string;
  studentName: string;
  grade: number | null;
  releasedAt: string | Date;
};

type PileFetcherData = { rows: PileSubmissionRow[]; hasMore: boolean };

function PileBody({
  classId,
  assignmentTypeId,
  filterQuery,
}: {
  classId: string;
  assignmentTypeId: string;
  filterQuery: string;
}) {
  const fetcher = useFetcher<PileFetcherData>();
  const [skip, setSkip] = useState(0);
  const [rows, setRows] = useState<PileSubmissionRow[]>([]);

  useEffect(() => {
    if (fetcher.state === 'idle' && !fetcher.data && rows.length === 0) {
      const sep = filterQuery ? `&` : '';
      fetcher.load(
        `/app/my-classes/${classId}/released-grades/pile/${assignmentTypeId}?${filterQuery}${sep}skip=0&take=50`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (fetcher.data) {
      setRows((prev) => [...prev, ...fetcher.data!.rows]);
    }
  }, [fetcher.data]);

  function loadMore() {
    const next = skip + 50;
    setSkip(next);
    const sep = filterQuery ? `&` : '';
    fetcher.load(
      `/app/my-classes/${classId}/released-grades/pile/${assignmentTypeId}?${filterQuery}${sep}skip=${next}&take=50`
    );
  }

  if (fetcher.state === 'loading' && rows.length === 0)
    return (
      <div className="py-3 text-sm text-muted-foreground">Loading…</div>
    );
  if (rows.length === 0)
    return (
      <div className="py-3 text-sm text-muted-foreground">
        No submissions match.
      </div>
    );

  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li
          key={r.submissionId}
          className="flex items-center justify-between py-2"
        >
          <a
            className="text-sm hover:underline"
            href={`/app/submissions/${r.submissionId}`}
          >
            {r.studentName}
          </a>
          <div className="text-xs text-muted-foreground">
            {r.grade != null ? <span className="mr-2">{r.grade}</span> : null}
            {new Date(r.releasedAt).toLocaleDateString()}
          </div>
        </li>
      ))}
      {fetcher.data?.hasMore ? (
        <li className="py-2">
          <button
            className="text-xs underline"
            onClick={loadMore}
            disabled={fetcher.state !== 'idle'}
          >
            Show more
          </button>
        </li>
      ) : null}
    </ul>
  );
}

export function PileAccordion({
  classId,
  piles,
  filterQuery,
  expandAll,
}: {
  classId: string;
  piles: Pile[];
  filterQuery: string;
  expandAll: boolean;
}) {
  const pileIds = useMemo(
    () => piles.map((p) => p.assignmentTypeId),
    [piles]
  );
  // Single-pile auto-expand; expand-all overrides; otherwise collapsed.
  const [openValues, setOpenValues] = useState<string[]>(() =>
    expandAll ? pileIds : piles.length === 1 ? [piles[0]!.assignmentTypeId] : []
  );
  const previousExpandAll = useRef(expandAll);

  useEffect(() => {
    setOpenValues((prev) => {
      if (expandAll) return pileIds;
      if (previousExpandAll.current) return [];

      const validIds = new Set(pileIds);
      const retained = prev.filter((id) => validIds.has(id));
      if (retained.length > 0) return retained;
      return piles.length === 1 ? [piles[0]!.assignmentTypeId] : [];
    });
    previousExpandAll.current = expandAll;
  }, [expandAll, pileIds, piles]);

  if (piles.length === 0) {
    return (
      <div className="rounded border p-6 text-sm text-muted-foreground">
        No released grades match the current filters.
      </div>
    );
  }

  return (
    <Accordion
      type="multiple"
      value={openValues}
      onValueChange={setOpenValues}
    >
      {piles.map((p) => (
        <AccordionItem key={p.assignmentTypeId} value={p.assignmentTypeId}>
          <AccordionTrigger>
            <div className="flex w-full items-baseline justify-between pr-2">
              <span className="font-medium">{p.title}</span>
              <span className="text-xs text-muted-foreground">
                {p.count} submissions · released{' '}
                {new Date(p.mostRecentReleasedAt).toLocaleDateString()}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <PileBody
              classId={classId}
              assignmentTypeId={p.assignmentTypeId}
              filterQuery={filterQuery}
            />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
