import { useEffect, useMemo, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import type { StudentPile } from '~/services/released-grades.server';

type StudentSubmissionRow = {
  submissionId: string;
  assignmentTypeId: string;
  assignmentTypeTitle: string;
  grade: number | null;
  releasedAt: string | Date;
};

function StudentBody({
  classId,
  studentProfileId,
  filterQuery,
}: {
  classId: string;
  studentProfileId: string;
  filterQuery: string;
}) {
  const fetcher = useFetcher<{ rows: StudentSubmissionRow[] }>();

  useEffect(() => {
    if (fetcher.state === 'idle' && !fetcher.data) {
      fetcher.load(
        `/app/my-classes/${classId}/released-grades/student/${studentProfileId}?${filterQuery}`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (fetcher.state === 'loading')
    return (
      <div className="py-3 text-sm text-muted-foreground">Loading…</div>
    );
  const rows = fetcher.data?.rows ?? [];
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
            {r.assignmentTypeTitle}
          </a>
          <div className="text-xs text-muted-foreground">
            {r.grade != null ? <span className="mr-2">{r.grade}</span> : null}
            {new Date(r.releasedAt).toLocaleDateString()}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function StudentAccordion({
  classId,
  studentPiles,
  filterQuery,
  expandAll,
}: {
  classId: string;
  studentPiles: StudentPile[];
  filterQuery: string;
  expandAll: boolean;
}) {
  const studentIds = useMemo(
    () => studentPiles.map((p) => p.studentProfileId),
    [studentPiles]
  );
  const [openValues, setOpenValues] = useState<string[]>(() =>
    expandAll
      ? studentIds
      : studentPiles.length === 1
        ? [studentPiles[0]!.studentProfileId]
        : []
  );
  const previousExpandAll = useRef(expandAll);

  useEffect(() => {
    setOpenValues((prev) => {
      if (expandAll) return studentIds;
      if (previousExpandAll.current) return [];

      const validIds = new Set(studentIds);
      const retained = prev.filter((id) => validIds.has(id));
      if (retained.length > 0) return retained;
      return studentPiles.length === 1
        ? [studentPiles[0]!.studentProfileId]
        : [];
    });
    previousExpandAll.current = expandAll;
  }, [expandAll, studentIds, studentPiles]);

  if (studentPiles.length === 0) {
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
      {studentPiles.map((p) => (
        <AccordionItem key={p.studentProfileId} value={p.studentProfileId}>
          <AccordionTrigger>
            <div className="flex w-full items-baseline justify-between pr-2">
              <span className="font-medium">{p.studentName}</span>
              <span className="text-xs text-muted-foreground">
                {p.count} submissions · most recent{' '}
                {new Date(p.mostRecentReleasedAt).toLocaleDateString()}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <StudentBody
              classId={classId}
              studentProfileId={p.studentProfileId}
              filterQuery={filterQuery}
            />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
