import { Link } from 'react-router';
import type { AssignmentTypeRow } from '../route';

const FIVE_PARAGRAPH_ESSAY_MOCK: AssignmentTypeRow = {
  id: 'mock-five-paragraph-essay',
  title: 'The 5-Paragraph Essay',
  image: null,
};

function withFiveParagraphEssayMock(
  assignmentTypes: AssignmentTypeRow[]
): AssignmentTypeRow[] {
  const thesisIndex = assignmentTypes.findIndex(
    (at) => at.title === 'The Thesis-Driven Essay'
  );
  if (thesisIndex === -1) return [...assignmentTypes, FIVE_PARAGRAPH_ESSAY_MOCK];
  const next = [...assignmentTypes];
  next.splice(thesisIndex + 1, 0, FIVE_PARAGRAPH_ESSAY_MOCK);
  return next;
}

export function AssignmentTypesList({
  assignmentTypes,
}: {
  assignmentTypes: AssignmentTypeRow[];
}) {
  const rows = withFiveParagraphEssayMock(assignmentTypes);

  if (rows.length === 0) {
    return (
      <div>
        <h2 className="text-base font-semibold mb-3">Assignment Types</h2>
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground text-sm">No assignment types yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Assignment Types</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {rows.map((at) => (
          <Link
            key={at.id}
            to={`/app/courses/${at.id}`}
            className="flex flex-col rounded-lg border transition-shadow hover:shadow bg-muted"
          >
            {at.image ? (
              <img
                src={`/api/image/course/${at.image.id}`}
                alt=""
                className="h-32 w-full rounded-t-lg object-cover"
              />
            ) : (
              <div className="h-32 w-full rounded-t-lg bg-gradient-to-br from-foreground/5 to-foreground/20" />
            )}
            <div className="p-3">
              <h4 className="text-foreground/90">{at.title}</h4>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
