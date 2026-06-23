import type { ReactNode } from 'react';
import { Form, Link } from 'react-router';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import {
  DEFAULT_PROMPT_CONFIG,
  DEFAULT_RUBRIC,
  DEFAULT_SCORING_SCALE,
  type PromptConfigData,
  type RubricData,
  type ScoringScaleData,
} from '~/domain/assignment-types/assignment-type-rubric.shared';
import {
  PromptConfigEditor,
  RubricEditor,
  ScoringScaleEditor,
} from './rubric-config-editors';

type AssignmentTypeEditorFormProps = {
  mode: 'create' | 'edit';
  titleDefaultValue?: string;
  kindDefaultValue?: string | null;
  descriptionDefaultValue?: string | null;
  scoringScale?: ScoringScaleData;
  rubric?: RubricData;
  promptConfig?: PromptConfigData;
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t py-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(180px,260px)_minmax(0,1fr)]">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              {description}
            </p>
          )}
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </section>
  );
}

export function AssignmentTypeEditorForm({
  mode,
  titleDefaultValue = '',
  kindDefaultValue = '',
  descriptionDefaultValue = '',
  scoringScale = DEFAULT_SCORING_SCALE,
  rubric = DEFAULT_RUBRIC,
  promptConfig = DEFAULT_PROMPT_CONFIG,
}: AssignmentTypeEditorFormProps) {
  return (
    <Form method="post" className="mx-auto max-w-5xl px-3 py-5 md:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" asChild>
          <Link to="/app/admin/assignments-grading">
            <ArrowLeft className="mr-2 size-4" />
            Assignments
          </Link>
        </Button>
        <Button type="submit">
          <Save className="mr-2 size-4" />
          {mode === 'create' ? 'Create assignment type' : 'Save assignment type'}
        </Button>
      </div>

      <header className="pb-6">
        <p className="text-sm font-medium text-muted-foreground">
          Assignment type
        </p>
        <h1 className="mt-1 text-3xl font-semibold">
          {mode === 'create' ? 'Create assignment type' : 'Edit assignment type'}
        </h1>
      </header>

      <Section
        title="Basics"
        description="Identity and teacher-facing description for this assignment base."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              defaultValue={titleDefaultValue}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kind">Stable kind</Label>
            <Input
              id="kind"
              name="kind"
              defaultValue={kindDefaultValue ?? ''}
              placeholder="act_writing"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={descriptionDefaultValue ?? ''}
          />
        </div>
      </Section>

      <Section
        title="Rubric"
        description="The source of truth shared by grading and tutor guidance."
      >
        <ScoringScaleEditor initial={scoringScale} namePrefix="assignmentType" />
        <RubricEditor initial={rubric} namePrefix="assignmentType" />
      </Section>

      <Section
        title="Grading assistant"
        description="Instructions for applying this rubric during submission review."
      >
        <PromptConfigEditor
          initial={promptConfig}
          namePrefix="assignmentType"
        />
      </Section>

      <Section
        title="Tutor settings"
        description="Module instructions and rubric relationships are configured after this assignment type exists."
      >
        <p className="text-sm text-muted-foreground">
          Save the assignment type, then configure its modules and rubric relationships.
        </p>
      </Section>
    </Form>
  );
}
