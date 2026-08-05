import * as React from 'react';
import { useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Textarea } from '~/components/ui/textarea';
import { Checkbox } from '~/components/ui/checkbox';
import { Badge } from '~/components/ui/badge';
import { Sparkles, RotateCcw, CheckCheck } from 'lucide-react';

type SeedSubmission = {
  localId: string;
  assignmentLocalId: string;
  essayText: string;
  status: 'draft' | 'submitted' | 'graded';
  grade?: {
    numericPercentage: number;
    letterGrade: string;
    overallScore: number;
    overallComment: string;
    rubricScores: Record<string, number>;
    released: boolean;
  };
};

type SeedClass = {
  localId: string;
  title: string;
  grade: string;
  period: string;
  schoolYear: string;
  approved: boolean;
};

type SeedAssignment = {
  localId: string;
  classLocalId: string;
  title: string;
  prompt: string;
  assignmentTypeTitle: string;
  approved: boolean;
};

type SeedStudent = {
  localId: string;
  name: string;
  classLocalId: string;
  writingProfile: 'struggling' | 'on_track' | 'advanced';
  submissions: SeedSubmission[];
  approved: boolean;
};

type SeedProposalState = {
  classes: SeedClass[];
  assignments: SeedAssignment[];
  students: SeedStudent[];
};

function classTitle(proposal: SeedProposalState, classLocalId: string) {
  return (
    proposal.classes.find((c) => c.localId === classLocalId)?.title ??
    `existing class (${classLocalId})`
  );
}

export function SeedGeneratorPanel({ organizationId }: { organizationId: string }) {
  const proposeFetcher = useFetcher<{ proposal?: SeedProposalState; error?: string }>();
  const commitFetcher = useFetcher<{
    summary?: {
      classesCreated: number;
      assignmentsCreated: number;
      studentsCreated: number;
      submissionsCreated: number;
      documentsCreated: number;
      skippedStudents: Array<{ localId: string; name: string; reason: string }>;
    };
    error?: string;
  }>();

  const [instructions, setInstructions] = React.useState('');
  const [proposal, setProposal] = React.useState<SeedProposalState | null>(null);

  React.useEffect(() => {
    if (proposeFetcher.data?.proposal) {
      // Every item starts approved; the admin unchecks what they don't want.
      const withApproval = proposeFetcher.data.proposal;
      setProposal({
        classes: withApproval.classes.map((c) => ({ ...c, approved: true })),
        assignments: withApproval.assignments.map((a) => ({ ...a, approved: true })),
        students: withApproval.students.map((s) => ({ ...s, approved: true })),
      });
    }
  }, [proposeFetcher.data]);

  React.useEffect(() => {
    if (commitFetcher.data?.summary) {
      setProposal(null);
      setInstructions('');
    }
  }, [commitFetcher.data]);

  const isProposing = proposeFetcher.state !== 'idle';
  const isCommitting = commitFetcher.state !== 'idle';

  function toggleClass(localId: string) {
    setProposal((prev) =>
      prev
        ? {
            ...prev,
            classes: prev.classes.map((c) =>
              c.localId === localId ? { ...c, approved: !c.approved } : c
            ),
          }
        : prev
    );
  }

  function toggleAssignment(localId: string) {
    setProposal((prev) =>
      prev
        ? {
            ...prev,
            assignments: prev.assignments.map((a) =>
              a.localId === localId ? { ...a, approved: !a.approved } : a
            ),
          }
        : prev
    );
  }

  function toggleStudent(localId: string) {
    setProposal((prev) =>
      prev
        ? {
            ...prev,
            students: prev.students.map((s) =>
              s.localId === localId ? { ...s, approved: !s.approved } : s
            ),
          }
        : prev
    );
  }

  function approveAll() {
    setProposal((prev) =>
      prev
        ? {
            classes: prev.classes.map((c) => ({ ...c, approved: true })),
            assignments: prev.assignments.map((a) => ({ ...a, approved: true })),
            students: prev.students.map((s) => ({ ...s, approved: true })),
          }
        : prev
    );
  }

  function clearProposal() {
    setProposal(null);
  }

  function commit() {
    if (!proposal) return;
    commitFetcher.submit(
      { intent: 'commit', proposal: JSON.stringify(proposal) },
      {
        method: 'post',
        action: `/app/admin/organizations/${organizationId}/seed-generator`,
      }
    );
  }

  const approvedCount =
    (proposal?.classes.filter((c) => c.approved).length ?? 0) +
    (proposal?.assignments.filter((a) => a.approved).length ?? 0) +
    (proposal?.students.filter((s) => s.approved).length ?? 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles size={18} />
          Generate demo data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Describe what you want in plain language, e.g. "add three 9th grade classes,
          a few struggling writers, one class mostly on track." Nothing is written until
          you approve individual items below.
        </p>
        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="add a struggling writer or two to English 9"
          rows={3}
          disabled={isProposing}
        />
        {proposeFetcher.data?.error ? (
          <p className="text-sm text-destructive">{proposeFetcher.data.error}</p>
        ) : null}
        <Button
          onClick={() =>
            proposeFetcher.submit(
              { intent: 'propose', instructions },
              {
                method: 'post',
                action: `/app/admin/organizations/${organizationId}/seed-generator`,
              }
            )
          }
          disabled={isProposing || !instructions.trim()}
        >
          {isProposing ? 'Generating…' : 'Generate proposal'}
        </Button>

        {proposal ? (
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                Proposal ({approvedCount} approved) — review before writing anything.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={approveAll}>
                  <CheckCheck size={14} className="mr-1" />
                  Approve all
                </Button>
                <Button variant="ghost" size="sm" onClick={clearProposal}>
                  <RotateCcw size={14} className="mr-1" />
                  Clear
                </Button>
              </div>
            </div>

            {proposal.classes.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  New classes
                </p>
                {proposal.classes.map((klass) => (
                  <label
                    key={klass.localId}
                    className="flex items-start gap-2 rounded-md border p-2"
                  >
                    <Checkbox
                      checked={klass.approved}
                      onCheckedChange={() => toggleClass(klass.localId)}
                    />
                    <span className="text-sm">
                      Class: "{klass.title}", grade {klass.grade}, period {klass.period}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}

            {proposal.assignments.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  New assignments
                </p>
                {proposal.assignments.map((assignment) => (
                  <label
                    key={assignment.localId}
                    className="flex items-start gap-2 rounded-md border p-2"
                  >
                    <Checkbox
                      checked={assignment.approved}
                      onCheckedChange={() => toggleAssignment(assignment.localId)}
                    />
                    <span className="text-sm">
                      Assignment: "{assignment.title}" ({assignment.assignmentTypeTitle}) —{' '}
                      {classTitle(proposal, assignment.classLocalId)}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}

            {proposal.students.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Students
                </p>
                {proposal.students.map((student) => (
                  <label
                    key={student.localId}
                    className="flex items-start gap-2 rounded-md border p-2"
                  >
                    <Checkbox
                      checked={student.approved}
                      onCheckedChange={() => toggleStudent(student.localId)}
                    />
                    <span className="text-sm">
                      Student: {student.name}, {student.submissions.length} submission
                      {student.submissions.length === 1 ? '' : 's'}{' '}
                      <Badge variant="outline">{student.writingProfile.replace('_', ' ')}</Badge>{' '}
                      — {classTitle(proposal, student.classLocalId)}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}

            {commitFetcher.data?.error ? (
              <p className="text-sm text-destructive">{commitFetcher.data.error}</p>
            ) : null}
            {commitFetcher.data?.summary ? (
              <p className="text-sm text-green-700">
                Created {commitFetcher.data.summary.classesCreated} classes,{' '}
                {commitFetcher.data.summary.studentsCreated} students,{' '}
                {commitFetcher.data.summary.submissionsCreated} submissions.
                {commitFetcher.data.summary.skippedStudents.length > 0
                  ? ` ${commitFetcher.data.summary.skippedStudents.length} student(s) were skipped (unresolved references).`
                  : ''}
              </p>
            ) : null}

            <Button onClick={commit} disabled={isCommitting || approvedCount === 0}>
              {isCommitting ? 'Writing…' : `Create ${approvedCount} approved item(s)`}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
