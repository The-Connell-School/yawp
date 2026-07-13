import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { Form, Link, useFetcher } from 'react-router';
import { ArchiveIcon, ArrowLeft, RotateCcwIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { ConfirmationDialog } from '~/components/confirmation-dialog';
import { AssignmentTypeImageThumbnail } from './assignment-type-image-thumbnail';
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
  promptConfigSnapshot,
  RubricConfigurationEditor,
  rubricSnapshot,
  scoringScaleSnapshot,
  type GradingAssistantPromptPreview,
} from './rubric-config-editors';
import {
  AssignmentTypeModulesSection,
  type AssignmentTypeModuleRow,
} from './assignment-type-modules-section';
import { RubricSourceBanner } from './rubric-source-indicator';
import type { AssignmentTypeEvaluationHistory } from '~/domain/ai-evaluation/assignment-type-evaluation.shared';

type AssignmentTypeEditorFormProps = {
  mode: 'create' | 'edit';
  assignmentTypeId?: string;
  titleDefaultValue?: string;
  descriptionDefaultValue?: string | null;
  scoringScale?: ScoringScaleData;
  rubric?: RubricData;
  promptConfig?: PromptConfigData;
  gradingAssistantPromptPreview?: GradingAssistantPromptPreview;
  gradingAssistantPromptPreviewUnavailableReason?: string;
  evaluationHistory?: AssignmentTypeEvaluationHistory;
  archivedAt?: Date | string | null;
  imageId?: string | null;
  modules?: AssignmentTypeModuleRow[];
};

function formSnapshot(values: {
  title: string;
  description: string;
  scoringScale: ScoringScaleData;
  rubric: RubricData;
  promptConfig: PromptConfigData;
}) {
  return [
    values.title.trim(),
    values.description.trim(),
    scoringScaleSnapshot(values.scoringScale),
    rubricSnapshot(values.rubric),
    promptConfigSnapshot(values.promptConfig),
  ].join('\u0000');
}

function promptAffectingSnapshot(values: {
  title: string;
  scoringScale: ScoringScaleData;
  rubric: RubricData;
  promptConfig: PromptConfigData;
}) {
  return [
    values.title.trim(),
    scoringScaleSnapshot(values.scoringScale),
    rubricSnapshot(values.rubric),
    promptConfigSnapshot(values.promptConfig),
  ].join('\u0000');
}

export function FieldLabel({
  htmlFor,
  required,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
    >
      {children}
      {required ? <span className="text-destructive"> *</span> : null}
    </label>
  );
}

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
  assignmentTypeId,
  titleDefaultValue = '',
  descriptionDefaultValue = '',
  scoringScale = DEFAULT_SCORING_SCALE,
  rubric = DEFAULT_RUBRIC,
  promptConfig = DEFAULT_PROMPT_CONFIG,
  gradingAssistantPromptPreview,
  gradingAssistantPromptPreviewUnavailableReason,
  evaluationHistory,
  archivedAt = null,
  imageId = null,
  modules = [],
}: AssignmentTypeEditorFormProps) {
  const fetcher = useFetcher();
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hasRemovedImage, setHasRemovedImage] = useState(false);
  const isEdit = mode === 'edit';
  const isSubmitting = isEdit && fetcher.state !== 'idle';
  const FormComponent = isEdit ? fetcher.Form : Form;

  const [title, setTitle] = useState(titleDefaultValue);
  const [description, setDescription] = useState(descriptionDefaultValue ?? '');
  const [scoringScaleState, setScoringScaleState] =
    useState<ScoringScaleData>(scoringScale);
  const [rubricState, setRubricState] = useState<RubricData>(rubric);
  const [promptConfigState, setPromptConfigState] =
    useState<PromptConfigData>(promptConfig);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const hasHydratedSavedValues = useRef(false);

  const savedSnapshot = useMemo(
    () =>
      formSnapshot({
        title: titleDefaultValue,
        description: descriptionDefaultValue ?? '',
        scoringScale,
        rubric,
        promptConfig,
      }),
    [
      titleDefaultValue,
      descriptionDefaultValue,
      scoringScale,
      rubric,
      promptConfig,
    ]
  );

  useEffect(() => {
    setTitle(titleDefaultValue);
    setDescription(descriptionDefaultValue ?? '');
    setScoringScaleState(scoringScale);
    setRubricState(rubric);
    setPromptConfigState(promptConfig);

    if (hasHydratedSavedValues.current) {
      setEditorGeneration((generation) => generation + 1);
    } else {
      hasHydratedSavedValues.current = true;
    }
  }, [savedSnapshot]);

  useEffect(() => {
    setPreviewUrl(null);
    setHasRemovedImage(false);
    if (imageFileInputRef.current) {
      imageFileInputRef.current.value = '';
    }
  }, [imageId]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const imageDirty = hasRemovedImage || previewUrl !== null;

  const currentSnapshot = useMemo(
    () =>
      formSnapshot({
        title,
        description,
        scoringScale: scoringScaleState,
        rubric: rubricState,
        promptConfig: promptConfigState,
      }),
    [title, description, scoringScaleState, rubricState, promptConfigState]
  );

  const savedPromptAffectingSnapshot = useMemo(
    () =>
      promptAffectingSnapshot({
        title: titleDefaultValue,
        scoringScale,
        rubric,
        promptConfig,
      }),
    [titleDefaultValue, scoringScale, rubric, promptConfig]
  );

  const currentPromptAffectingSnapshot = useMemo(
    () =>
      promptAffectingSnapshot({
        title,
        scoringScale: scoringScaleState,
        rubric: rubricState,
        promptConfig: promptConfigState,
      }),
    [title, scoringScaleState, rubricState, promptConfigState]
  );

  const isPromptPreviewStale =
    currentPromptAffectingSnapshot !== savedPromptAffectingSnapshot;

  const isDirty = currentSnapshot !== savedSnapshot || imageDirty;
  const canSubmit = isEdit ? isDirty && !isSubmitting : !isSubmitting;
  const submitLabel = isEdit
    ? isSubmitting
      ? 'Updating...'
      : 'Update'
    : isSubmitting
      ? 'Creating...'
      : 'Create';

  function handleCancel() {
    setTitle(titleDefaultValue);
    setDescription(descriptionDefaultValue ?? '');
    setScoringScaleState(scoringScale);
    setRubricState(rubric);
    setPromptConfigState(promptConfig);
    setPreviewUrl(null);
    setHasRemovedImage(false);
    if (imageFileInputRef.current) {
      imageFileInputRef.current.value = '';
    }
    setEditorGeneration((generation) => generation + 1);
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });
    setHasRemovedImage(false);
  }

  function handleRemoveImage() {
    setHasRemovedImage(true);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    if (imageFileInputRef.current) {
      imageFileInputRef.current.value = '';
    }
  }

  function handleArchive() {
    fetcher.submit({ intent: 'deleteCourse' }, { method: 'post' });
  }

  function handleRestore() {
    fetcher.submit({ intent: 'unarchiveCourse' }, { method: 'post' });
  }

  const formId = isEdit
    ? 'assignment-type-edit-form'
    : 'assignment-type-create-form';

  return (
    <>
      <FormComponent
        id={formId}
        method="post"
        encType={isEdit ? 'multipart/form-data' : undefined}
        className="mx-auto max-w-5xl px-3 py-5 pb-28 md:px-6"
      >
        {isEdit ? (
          <input type="hidden" name="intent" value="updateCourse" />
        ) : null}

        <header className="flex justify-between gap-4 pb-6">
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              asChild
            >
              <Link to="/app/admin/assignments">
                <ArrowLeft className="mr-2 size-4 shrink-0" />
                Back
              </Link>
            </Button>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Assignment type
              </p>
              <h1 className="mt-1 text-3xl font-semibold">
                {isEdit ? 'Edit assignment type' : 'Create assignment type'}
              </h1>
            </div>
          </div>
          {isEdit ? (
            <AssignmentTypeImageThumbnail
              imageId={imageId}
              previewUrl={previewUrl}
              hasRemovedImage={hasRemovedImage}
              disabled={isSubmitting}
              fileInputRef={imageFileInputRef}
              onImageChange={handleImageChange}
              onRemoveImage={handleRemoveImage}
            />
          ) : null}
        </header>

        <Section
          title="Basics"
          description="Identity and teacher-facing description for this assignment base."
        >
          <div className="space-y-2">
            <FieldLabel htmlFor="title" required>
              Title
            </FieldLabel>
            <Input
              id="title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="description">Description</FieldLabel>
            <Textarea
              id="description"
              name="description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </Section>

        <Section
          title="Rubric"
          description="The source of truth shared by grading and tutor guidance."
        >
          <RubricSourceBanner rubric={rubricState} />
          <RubricConfigurationEditor
            key={`rubric-editor-${editorGeneration}`}
            initialScoringScale={scoringScaleState}
            initialRubric={rubricState}
            namePrefix="assignmentType"
            excludeAssignmentTypeId={assignmentTypeId ?? null}
            onScoringScaleChange={setScoringScaleState}
            onRubricChange={setRubricState}
          />
        </Section>

        <Section
          title="Grading assistant"
          description="Instructions for applying this rubric during submission review."
        >
          <PromptConfigEditor
            key={`prompt-editor-${editorGeneration}`}
            initial={promptConfigState}
            namePrefix="assignmentType"
            onChange={setPromptConfigState}
            gradingAssistantPromptPreview={gradingAssistantPromptPreview}
            gradingAssistantPromptPreviewUnavailableReason={
              gradingAssistantPromptPreviewUnavailableReason
            }
            isPromptPreviewStale={isPromptPreviewStale}
            assignmentTypeId={assignmentTypeId ?? null}
            title={title}
            scoringScale={scoringScaleState}
            rubric={rubricState}
            evaluationHistory={evaluationHistory}
          />
        </Section>

        {!isEdit ? (
          <Section
            title="Tutor settings"
            description="Module instructions and rubric relationships are configured after this assignment type exists."
          >
            <p className="text-sm text-muted-foreground">
              Save the assignment type, then configure its modules and rubric
              relationships.
            </p>
          </Section>
        ) : null}
      </FormComponent>

      {isEdit ? (
        <div className="mx-auto max-w-5xl px-3 pb-28 md:px-6">
          <Section
            title="Tutor settings"
            description="Module instructions and rubric relationships are configured after this assignment type exists."
          >
            <AssignmentTypeModulesSection
              assignmentTypeId={assignmentTypeId!}
              modules={modules}
            />
          </Section>
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-3 py-3 md:px-6">
          <div className="flex items-center gap-2">
            {isEdit ? (
              archivedAt ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleRestore}
                  disabled={isSubmitting}
                  aria-label="Restore assignment type"
                >
                  <RotateCcwIcon className="size-4" />
                </Button>
              ) : (
                <ConfirmationDialog
                  variant="destructive"
                  title="Archive assignment type"
                  description={`Archive "${title.trim() || titleDefaultValue}"? Existing assignments and documents will keep this assignment type, but it will no longer appear as an option for dashboards or new assignments.`}
                  confirmText="Archive assignment type"
                  cancelText="Cancel"
                  onConfirm={handleArchive}
                  onCancel={() => {}}
                >
                  <Button
                    type="button"
                    variant="destructive-outline"
                    size="icon"
                    aria-label="Archive assignment type"
                    disabled={isSubmitting}
                  >
                    <ArchiveIcon className="size-4" />
                  </Button>
                </ConfirmationDialog>
              )
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isSubmitting || !isDirty}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              variant={canSubmit ? 'default' : 'outline'}
              disabled={!canSubmit}
            >
              {submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
