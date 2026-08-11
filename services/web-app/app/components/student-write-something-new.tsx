import { Link } from 'react-router';
import { PenLine } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';

export type StudentWriteSomethingNewType = {
  id: string;
  title: string;
};

/**
 * The student's entry point into a new document. The options are always
 * supplied by the caller's loader — the assignment types enabled for that
 * student's organization, school, or teacher — never a list defined here.
 * Renders nothing when the student has no assignment types available.
 */
export function StudentWriteSomethingNew({
  assignmentTypes,
}: {
  assignmentTypes: StudentWriteSomethingNewType[];
}) {
  if (assignmentTypes.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="shrink-0">
          <PenLine className="mr-2 h-4 w-4" />
          Write something new
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {assignmentTypes.map((assignmentType) => (
          <DropdownMenuItem key={assignmentType.id} asChild>
            <Link to={`/app/assignment-types/${assignmentType.id}`}>
              {assignmentType.title}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
