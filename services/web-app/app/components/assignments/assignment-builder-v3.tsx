import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  useBlocker,
  useFetcher,
  useNavigate,
  useSearchParams,
} from 'react-router';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  FileUp,
  Lock,
  X,
} from 'lucide-react';
import type { AssignmentCreationAssignmentType } from '~/components/assignments/assignment-creation-sheet';
import { AssignmentTypeSearchSelect } from '~/components/assignments/assignment-type-search-select';
import type { SiteLicenseLockedAssignmentTile } from '~/domain/free-tier/site-license-locked-assignment-tiles';
import {
  DEFAULT_COLLABORATION_GROUP_MODE,
  DEFAULT_COLLABORATION_GROUP_SIZE,
} from '~/domain/assignments/collaboration';
import {
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  gradingAssistantStrictnessOptions,
  type GradingAssistantStrictnessLevel,
} from '~/domain/grading/grading-assistant-strictness';
import {
  resolveNewAssignmentPointValue,
} from '~/domain/assignments/new-assignment-defaults';
import { isExitTicketAssignmentType } from '~/domain/assignment-types/exit-ticket';
import { useTeachingAccess } from '~/components/free-tier/teaching-access-context';
import { lockedTeachingButtonProps } from '~/components/free-tier/locked-teaching-control';
import { TeachingApprovalRequiredAlert } from '~/components/free-tier/teaching-approval-required-alert';
import { isTeachingApprovalRequiredActionData } from '~/domain/free-tier/teaching-approval-required';
import { toDateInputValue } from '~/utils/date-only';
import { assignmentBuilderV3ShowGroupProjectToggle } from '~/domain/assignments/assignment-builder-v3-group-project';
import { resolvePostCreateAssignmentNavigation } from '~/domain/assignments/post-create-assignment-navigation';
import {
  canBrowserHistoryGoBack,
  handleHistoryBackClick,
  navigateBackOr,
} from '~/utils/browser-history-back.client';
import { cn } from '~/utils/misc';
import type { AssignmentBuilderV3Class } from './assignment-builder-v3-loader.server';
import './assignment-builder-v3.css';

type CreateApiResponse = {
  success?: boolean;
  message?: string;
  assignmentId?: string;
  title?: string;
  typeTitle?: string;
  classLabels?: string[];
  nextStep?: { url: string; classCount: number } | null;
};

type UpdateApiResponse = {
  success?: boolean;
  message?: string;
};

export type AssignmentBuilderV3EditInitial = {
  assignmentId: string;
  classId: string;
  breadcrumbTitle: string;
  assignmentTypeId: string;
  classLabels: string[];
  title: string;
  prompt: string;
  postAt: string | null;
  dueAt: string | null;
  submitForGrade: boolean;
  pointValue: number | null;
  strictness: GradingAssistantStrictnessLevel;
  tutorEnabled: boolean;
  grammarGradingEnabled: boolean;
  collaborationEnabled: boolean;
  promptAttachmentName: string | null;
  assignmentTypeLocked: boolean;
};

export type AssignmentBuilderV3Defaults = {
  assignmentTypeId: string;
  classIds: string[];
  title: string;
  prompt: string;
  pointValue: string;
  dueAt: string;
};

export type AssignmentBuilderV3Props = {
  mode: 'create' | 'edit';
  assignmentTypes: AssignmentCreationAssignmentType[];
  siteLicenseLockedAssignmentTiles: SiteLicenseLockedAssignmentTile[];
  classes: AssignmentBuilderV3Class[];
  defaults: AssignmentBuilderV3Defaults;
  isFirstAssignment?: boolean;
  firstAssignmentPageTitle?: string;
  firstAssignmentIntro?: string;
  editing?: AssignmentBuilderV3EditInitial;
  priorAssignmentCount?: number;
};

function strictnessHelper(level: GradingAssistantStrictnessLevel) {
  if (level === 'beginner') {
    return 'Reads gently, for writers still learning the basics.';
  }
  const opt = gradingAssistantStrictnessOptions.find((o) => o.value === level);
  return opt?.description ?? '';
}

function Abv3Switch({
  id,
  checked,
  onChange,
  disabled,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  /** One line under the label saying what the setting does. */
  description?: string;
}) {
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div className="abv3-switch-row">
      <div className="abv3-switch-text">
        <label htmlFor={id} className="abv3-switch-label">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="abv3-switch-description">
            {description}
          </p>
        ) : null}
      </div>
      <span
        className="abv3-switch-state"
        data-on={checked ? 'true' : 'false'}
        aria-hidden
      >
        {checked ? 'On' : 'Off'}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descriptionId}
        data-on={checked ? 'true' : 'false'}
        className="abv3-switch"
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="abv3-switch-knob" />
      </button>
    </div>
  );
}

export function AssignmentBuilderV3({
  mode,
  assignmentTypes,
  siteLicenseLockedAssignmentTiles,
  classes,
  defaults,
  isFirstAssignment,
  firstAssignmentPageTitle,
  firstAssignmentIntro,
  editing,
  priorAssignmentCount = 1,
}: AssignmentBuilderV3Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const createFetcher = useFetcher<CreateApiResponse>();
  const updateFetcher = useFetcher<UpdateApiResponse>();
  const extractFetcher = useFetcher<{
    success?: boolean;
    message?: string;
    title?: string;
    prompt?: string;
  }>();
  const { locked: teachingLocked, loading: teachingLoading } =
    useTeachingAccess();

  const isEdit = mode === 'edit' && Boolean(editing);
  const isSaving =
    createFetcher.state !== 'idle' || updateFetcher.state !== 'idle';

  const [classMenuOpen, setClassMenuOpen] = useState(false);

  const [assignmentTypeId, setAssignmentTypeId] = useState(
    editing?.assignmentTypeId ?? defaults.assignmentTypeId
  );
  const [classIds, setClassIds] = useState<string[]>(
    isEdit ? [] : defaults.classIds.filter(Boolean)
  );
  const [title, setTitle] = useState(editing?.title ?? defaults.title);
  const [prompt, setPrompt] = useState(editing?.prompt ?? defaults.prompt);
  const [dueAt, setDueAt] = useState(
    editing?.dueAt
      ? toDateInputValue(new Date(editing.dueAt))
      : defaults.dueAt
  );
  const [postAt, setPostAt] = useState(
    editing?.postAt ? toDateInputValue(new Date(editing.postAt)) : ''
  );
  const [submitForGrade, setSubmitForGrade] = useState(
    editing?.submitForGrade ?? true
  );
  const [pointValue, setPointValue] = useState(() => {
    if (isEdit && editing) {
      return editing.pointValue != null ? String(editing.pointValue) : '';
    }
    if (isFirstAssignment && defaults.pointValue != null && defaults.pointValue !== '') {
      return String(defaults.pointValue);
    }
    const type = assignmentTypes.find(
      (t) => t.id === (editing?.assignmentTypeId ?? defaults.assignmentTypeId)
    );
    const resolved = resolveNewAssignmentPointValue({
      isEditing: false,
      explicitPointValue: undefined,
      assignmentType: {
        kind: type?.kind ?? null,
        rubricName: type?.rubricName ?? null,
      },
    });
    return resolved != null ? String(resolved) : '100';
  });
  const [strictness, setStrictness] = useState<GradingAssistantStrictnessLevel>(
    editing?.strictness ?? DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL
  );
  const [tutorEnabled, setTutorEnabled] = useState(
    editing?.tutorEnabled ?? true
  );
  const [grammarGradingEnabled, setGrammarGradingEnabled] = useState(
    editing?.grammarGradingEnabled ?? true
  );
  const [groupProjectEnabled, setGroupProjectEnabled] = useState(
    editing?.collaborationEnabled ?? false
  );
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [removePdf, setRemovePdf] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const classPickerRef = useRef<HTMLDivElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const extractInputRef = useRef<HTMLInputElement>(null);

  const selectedType = useMemo(
    () => assignmentTypes.find((t) => t.id === assignmentTypeId),
    [assignmentTypes, assignmentTypeId]
  );
  const remainingClassOptions = useMemo(
    () => classes.filter((klass) => !classIds.includes(klass.id)),
    [classes, classIds]
  );
  const isExitTicket = isExitTicketAssignmentType(selectedType);
  const gradesGrammar = Boolean(selectedType?.gradesGrammar);
  const showGroupProjectToggle = assignmentBuilderV3ShowGroupProjectToggle({
    collaborationSupported: Boolean(selectedType?.collaborationSupported),
    isEdit,
    editingCollaborationEnabled: Boolean(editing?.collaborationEnabled),
  });

  const markDirty = useCallback(() => setDirty(true), []);

  useEffect(() => {
    if (!selectedType?.collaborationSupported && !isEdit) {
      setGroupProjectEnabled(false);
    }
  }, [assignmentTypeId, isEdit, selectedType?.collaborationSupported]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (
        classMenuOpen &&
        classPickerRef.current &&
        !classPickerRef.current.contains(event.target as Node)
      ) {
        setClassMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [classMenuOpen]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isEdit &&
      dirty &&
      !isSaving &&
      !savedFlash &&
      currentLocation.pathname !== nextLocation.pathname
  );

  const approvalBlocked = isTeachingApprovalRequiredActionData(
    createFetcher.data
  );

  const canCreate =
    !isEdit &&
    Boolean(assignmentTypeId) &&
    classIds.length > 0 &&
    prompt.trim().length > 0 &&
    (!isExitTicket || prompt.trim().length > 0);

  const canSave =
    isEdit &&
    dirty &&
    prompt.trim().length > 0 &&
    (!isExitTicket || prompt.trim().length > 0);

  const tutorLocked = isEdit;
  const grammarLocked = isEdit;


  useEffect(() => {
    const data = createFetcher.data;
    if (!data || createFetcher.state !== 'idle') return;
    if (data.success && data.nextStep?.url) {
      void navigate(data.nextStep.url);
      return;
    }
    if (data.success && data.assignmentId) {
      const destination = resolvePostCreateAssignmentNavigation({
        assignmentId: data.assignmentId,
        priorAssignmentCount,
        classId: classIds[0] ?? null,
        exitTo: searchParams.get('exitTo'),
        canGoBack: canBrowserHistoryGoBack(),
      });
      setDirty(false);
      if (destination.kind === 'back') {
        void navigate(-1);
      } else {
        void navigate(destination.url);
      }
      return;
    }
    if (!data.success && data.message) {
      setFormError(data.message);
    }
  }, [
    createFetcher.data,
    createFetcher.state,
    priorAssignmentCount,
    classIds,
    navigate,
    searchParams,
  ]);

  useEffect(() => {
    const data = updateFetcher.data;
    if (!data || updateFetcher.state !== 'idle') return;
    if (data.success) {
      setDirty(false);
      setSavedFlash(true);
      const t = window.setTimeout(() => setSavedFlash(false), 2000);
      return () => window.clearTimeout(t);
    }
    if (!data.success && data.message) {
      setFormError(data.message);
    }
  }, [updateFetcher.data, updateFetcher.state]);

  useEffect(() => {
    const data = extractFetcher.data;
    if (!data || extractFetcher.state !== 'idle') return;
    if (data.success) {
      if (data.title) setTitle(data.title);
      if (data.prompt) setPrompt(data.prompt);
      markDirty();
    } else if (data.message) {
      setFormError(data.message);
    }
  }, [extractFetcher.data, extractFetcher.state, markDirty]);

  function toggleClass(id: string) {
    markDirty();
    setClassIds((current) =>
      current.includes(id)
        ? current.filter((row) => row !== id)
        : [...current, id]
    );
  }

  function buildCreateFormData() {
    const fd = new FormData();
    fd.set('intent', 'create-assignment');
    fd.set('assignmentTypeId', assignmentTypeId);
    for (const id of classIds) {
      fd.append('classIds', id);
    }
    if (title.trim()) fd.set('title', title.trim());
    fd.set('prompt', prompt);
    fd.set('submitForGrade', submitForGrade ? 'true' : 'false');
    if (submitForGrade && pointValue.trim()) {
      fd.set('pointValue', pointValue.trim());
    }
    fd.set('gradingAssistantStrictnessLevel', strictness);
    fd.set('tutorEnabled', tutorEnabled ? 'true' : 'false');
    fd.set('grammarGradingEnabled', grammarGradingEnabled ? 'true' : 'false');
    const collaborationEnabled = groupProjectEnabled;
    fd.set('collaborationEnabled', collaborationEnabled ? 'true' : 'false');
    if (collaborationEnabled) {
      fd.set('collaborationGroupMode', DEFAULT_COLLABORATION_GROUP_MODE);
      fd.set(
        'collaborationGroupSize',
        String(DEFAULT_COLLABORATION_GROUP_SIZE)
      );
    }
    if (postAt) fd.set('postAt', postAt);
    if (dueAt) fd.set('dueAt', dueAt);
    if (pdfFile) fd.set('promptAttachment', pdfFile);
    return fd;
  }

  function buildUpdateFormData() {
    if (!editing) throw new Error('missing edit context');
    const fd = new FormData();
    fd.set('intent', 'update-assignment');
    fd.set('assignmentId', editing.assignmentId);
    fd.set('assignmentTypeId', assignmentTypeId);
    if (title.trim()) fd.set('title', title.trim());
    fd.set('prompt', prompt);
    fd.set('submitForGrade', submitForGrade ? 'true' : 'false');
    if (submitForGrade && pointValue.trim()) {
      fd.set('pointValue', pointValue.trim());
    }
    fd.set('gradingAssistantStrictnessLevel', strictness);
    if (postAt) {
      fd.set('postAt', postAt);
    } else {
      fd.set('postAt', '');
    }
    if (dueAt) {
      fd.set('dueAt', dueAt);
    } else {
      fd.set('dueAt', '');
    }
    if (removePdf) fd.set('removePromptAttachment', 'true');
    if (pdfFile) fd.set('promptAttachment', pdfFile);
    return fd;
  }

  function handleCreate() {
    if (!canCreate || teachingLocked || teachingLoading) return;
    setFormError(null);
    void createFetcher.submit(buildCreateFormData(), {
      method: 'post',
      action: '/api/assignments/create',
      encType: 'multipart/form-data',
    });
  }

  function handleSave() {
    if (!canSave || !editing || teachingLocked || teachingLoading) return;
    setFormError(null);
    void updateFetcher.submit(buildUpdateFormData(), {
      method: 'post',
      action: `/app/assignments/${editing.assignmentId}?classId=${editing.classId}`,
      encType: 'multipart/form-data',
    });
  }

  const pageTitle = isFirstAssignment
    ? (firstAssignmentPageTitle ?? 'Create your first assignment')
    : isEdit
      ? 'Edit assignment'
      : 'New assignment';

  const newAssignmentBackFallback = '/app/assignments';
  const breadcrumbHref = isEdit
    ? `/app/assignments/${editing!.assignmentId}?classId=${editing!.classId}`
    : newAssignmentBackFallback;
  const breadcrumbLabel = isEdit ? editing!.breadcrumbTitle : 'Back';

  const footerStatus = (() => {
    if (updateFetcher.state !== 'idle') return 'Saving…';
    if (savedFlash) return 'Saved';
    if (isEdit && dirty) return 'Unsaved changes';
    if (!isEdit && !canCreate) return null;
    return null;
  })();

  return (
    <div className="abv3-root" data-testid="assignment-builder-v3">
      <div className="abv3-scroll">
        <div className="abv3-inner">
          <Link
            to={breadcrumbHref}
            className="abv3-breadcrumb"
            onClick={(event) => {
              if (!isEdit) {
                handleHistoryBackClick(event, navigate);
              }
            }}
          >
            <ChevronLeft size={14} aria-hidden />
            {breadcrumbLabel}
          </Link>
          <h1 className="abv3-h1">{pageTitle}</h1>
          {isFirstAssignment && firstAssignmentIntro ? (
            <p className="abv3-subcopy">{firstAssignmentIntro}</p>
          ) : null}
          {isEdit ? (
            <p className="abv3-subcopy">
              Students keep the documents they have already started.
            </p>
          ) : null}

          <div>
            {isEdit ? (
              <span className="abv3-field-label">Type</span>
            ) : (
              <label
                htmlFor="abv3-assignment-type"
                className="abv3-field-label"
              >
                Type
              </label>
            )}
            {isEdit ? (
              <div className="abv3-input abv3-input--locked" aria-readonly>
                {selectedType?.title ?? 'Assignment type'}
              </div>
            ) : (
              <AssignmentTypeSearchSelect
                id="abv3-assignment-type"
                assignmentTypes={assignmentTypes}
                value={assignmentTypeId}
                lockedTiles={siteLicenseLockedAssignmentTiles}
                disabled={Boolean(editing?.assignmentTypeLocked)}
                triggerClassName="abv3-type-select-trigger"
                onValueChange={(nextTypeId) => {
                  setAssignmentTypeId(nextTypeId);
                  markDirty();
                }}
              />
            )}
          </div>

          {approvalBlocked ? (
            <div style={{ marginTop: 16 }}>
              <TeachingApprovalRequiredAlert />
            </div>
          ) : null}
          {formError ? (
            <p className="abv3-error" role="alert" style={{ marginTop: 12 }}>
              {formError}
            </p>
          ) : null}

          {isExitTicket ? (
            <p className="abv3-subcopy" style={{ marginTop: 16 }}>
              Exit tickets use the dedicated builder in the assignment sheet for
              now. Pick another type here, or create an exit ticket from My
              Classes.
            </p>
          ) : null}

          <div className="abv3-fields">
            <div>
              {isEdit ? (
                <span className="abv3-field-label">Assign to</span>
              ) : (
                <label htmlFor="abv3-class-input" className="abv3-field-label">
                  Assign to
                </label>
              )}
              <div
                id="abv3-class-input"
                ref={!isEdit ? classPickerRef : undefined}
                role={isEdit ? undefined : 'combobox'}
                aria-expanded={isEdit ? undefined : classMenuOpen}
                aria-haspopup={isEdit ? undefined : 'listbox'}
                className={cn(
                  'abv3-class-chips',
                  isEdit && 'abv3-class-chips--locked'
                )}
                aria-disabled={isEdit ? true : undefined}
                onClick={() => {
                  if (!isEdit) setClassMenuOpen((open) => !open);
                }}
              >
                {isEdit
                  ? editing!.classLabels.map((label) => (
                      <span key={label} className="abv3-chip abv3-chip--locked">
                        {label}
                      </span>
                    ))
                  : classIds.map((id) => {
                      const label =
                        classes.find((c) => c.id === id)?.label ?? id;
                      return (
                        <span key={id} className="abv3-chip">
                          {label}
                          <button
                            type="button"
                            className="abv3-chip-remove"
                            aria-label={`Remove ${label}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleClass(id);
                            }}
                          >
                            <X size={12} strokeWidth={2} />
                          </button>
                        </span>
                      );
                    })}
                {!isEdit && classIds.length > 0 ? (
                  remainingClassOptions.length === 0 ? (
                    <span className="abv3-class-empty-hint">No more classes</span>
                  ) : (
                    <span className="abv3-class-input-spacer" aria-hidden />
                  )
                ) : null}
                <span
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    marginTop: isEdit ? -7 : -8,
                    color: 'hsl(50 2.4% 36%)',
                    display: 'flex',
                  }}
                >
                  {isEdit ? (
                    <Lock size={14} aria-hidden />
                  ) : (
                    <ChevronDown size={16} aria-hidden />
                  )}
                </span>
                {!isEdit && classMenuOpen ? (
                  <div className="abv3-class-menu">
                    {remainingClassOptions.length === 0 ? (
                      <p className="abv3-class-menu-empty">No more classes</p>
                    ) : (
                      remainingClassOptions.map((klass) => (
                        <button
                          key={klass.id}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleClass(klass.id);
                            setClassMenuOpen(false);
                          }}
                        >
                          {klass.label}
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <div>
              <label htmlFor="abv3-title" className="abv3-field-label">
                Title{' '}
                <span className="abv3-field-label-muted">(optional)</span>
              </label>
              <input
                id="abv3-title"
                type="text"
                className="abv3-input"
                value={title}
                placeholder="e.g. Community Gardens — Prewriting"
                onChange={(e) => {
                  setTitle(e.target.value);
                  markDirty();
                }}
              />
            </div>

            <div>
              <label htmlFor="abv3-prompt" className="abv3-field-label">
                Prompt
              </label>
              <div className="abv3-input-wrap">
                <textarea
                  id="abv3-prompt"
                  className="abv3-textarea"
                  value={prompt}
                  placeholder="What should students write about?"
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    markDirty();
                  }}
                />
                <button
                  type="button"
                  className="abv3-text-link"
                  style={{
                    position: 'absolute',
                    right: 8,
                    bottom: 8,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 6px',
                  }}
                  onClick={() => extractInputRef.current?.click()}
                >
                  <FileUp size={14} aria-hidden />
                  Extract from PDF
                </button>
                <input
                  ref={extractInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    const extractClassId =
                      classIds[0] ?? classes[0]?.id ?? '';
                    if (!extractClassId) {
                      setFormError('Choose a class before extracting from a PDF.');
                      return;
                    }
                    const fd = new FormData();
                    fd.set('classId', extractClassId);
                    fd.set('file', file);
                    void extractFetcher.submit(fd, {
                      method: 'post',
                      action: '/api/domain/assignment-pdf-extract',
                      encType: 'multipart/form-data',
                    });
                  }}
                />
              </div>
            </div>

            <div className="abv3-row-2">
              <div className="abv3-due">
                <label htmlFor="abv3-due" className="abv3-field-label">
                  Due date{' '}
                  <span className="abv3-field-label-muted">(optional)</span>
                </label>
                <div className="abv3-input-wrap">
                  <input
                    id="abv3-due"
                    type="date"
                    className={cn('abv3-input', 'abv3-input-with-icon')}
                    value={dueAt}
                    onChange={(e) => {
                      setDueAt(e.target.value);
                      markDirty();
                    }}
                  />
                  <span className="abv3-input-icon">
                    <Calendar size={16} aria-hidden />
                  </span>
                </div>
              </div>
              <div className="abv3-due">
                <label htmlFor="abv3-post" className="abv3-field-label">
                  Post date{' '}
                  <span className="abv3-field-label-muted">(optional)</span>
                </label>
                <div className="abv3-input-wrap">
                  <input
                    id="abv3-post"
                    type="date"
                    className={cn('abv3-input', 'abv3-input-with-icon')}
                    value={postAt}
                    onChange={(e) => {
                      setPostAt(e.target.value);
                      markDirty();
                    }}
                  />
                  <span className="abv3-input-icon">
                    <Calendar size={16} aria-hidden />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Always shown: these are part of every assignment, not extras.
              One rounded group, a divider between sections, even padding. */}
          <div className="abv3-settings">
            <section className="abv3-settings-section" aria-label="PDF attachment">
              <div className="abv3-settings-row">
                <div className="abv3-settings-text">
                  <span className="abv3-field-label abv3-settings-title">
                    PDF attachment{' '}
                    <span className="abv3-field-label-muted">(optional)</span>
                  </span>
                  <span className="abv3-settings-status">
                    {pdfFile
                      ? pdfFile.name
                      : editing?.promptAttachmentName && !removePdf
                        ? editing.promptAttachmentName
                        : 'No PDF attached'}
                  </span>
                </div>
                <div className="abv3-settings-actions">
                  {editing?.promptAttachmentName && !removePdf && !pdfFile ? (
                    <button
                      type="button"
                      className="abv3-btn-outline"
                      onClick={() => {
                        setRemovePdf(true);
                        markDirty();
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="abv3-btn-outline"
                    onClick={() => pdfInputRef.current?.click()}
                  >
                    Choose PDF
                  </button>
                </div>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    event.target.value = '';
                    setPdfFile(file);
                    setRemovePdf(false);
                    markDirty();
                  }}
                />
              </div>
              <p className="abv3-settings-helper">
                Any documents uploaded here will be attached to the prompt and
                available to be viewed by students as they are working on their
                assignment.
              </p>
            </section>

            <section className="abv3-settings-section" aria-label="Grading">
              <SnapshotAdvancedGrading
                submitForGrade={submitForGrade}
                onSubmitForGrade={(v) => {
                  setSubmitForGrade(v);
                  markDirty();
                }}
                pointValue={pointValue}
                onPointValue={(v) => {
                  setPointValue(v);
                  markDirty();
                }}
                strictness={strictness}
                onStrictness={(v) => {
                  setStrictness(v);
                  markDirty();
                }}
              />
            </section>

            <section className="abv3-settings-section" aria-label="Tutor and documents">
              <Abv3Switch
                id="abv3-tutor"
                label="Tutor enabled"
                description="Students can ask the Yawp! tutor for help while they write. It never writes for them. Turning it off removes it from students' documents. Great for in-class essays or checking to see how a student does on their own."
                checked={tutorEnabled}
                disabled={tutorLocked}
                onChange={(v) => {
                  setTutorEnabled(v);
                  markDirty();
                }}
              />
              {gradesGrammar ? (
                <Abv3Switch
                  id="abv3-grammar"
                  label="Grammar and syntax grading"
                  description="Grading also scores grammar and syntax."
                  checked={grammarGradingEnabled}
                  disabled={grammarLocked}
                  onChange={(v) => {
                    setGrammarGradingEnabled(v);
                    markDirty();
                  }}
                />
              ) : null}
              {showGroupProjectToggle ? (
                <Abv3Switch
                  id="abv3-group-project"
                  label="Group project"
                  description="Turn on for a collaborative document."
                  checked={groupProjectEnabled}
                  disabled={isEdit}
                  onChange={(v) => {
                    setGroupProjectEnabled(v);
                    markDirty();
                  }}
                />
              ) : null}
            </section>
          </div>
        </div>
      </div>

      <footer className="abv3-footer">
        <div className="abv3-footer-inner">
          <div className="abv3-footer-status">{footerStatus}</div>
          {!isEdit ? (
            <>
              <button
                type="button"
                className="abv3-btn-outline"
                onClick={() =>
                  navigateBackOr(navigate, newAssignmentBackFallback)
                }
              >
                Cancel
              </button>
              <button
                type="button"
                className="abv3-btn-primary"
                disabled={
                  !canCreate ||
                  isSaving ||
                  isExitTicket ||
                  teachingLocked ||
                  teachingLoading
                }
                {...lockedTeachingButtonProps(
                  teachingLocked || teachingLoading
                )}
                onClick={handleCreate}
              >
                {isSaving ? 'Creating…' : 'Create assignment'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="abv3-btn-outline"
                onClick={() => void navigate(breadcrumbHref)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="abv3-btn-primary"
                disabled={!canSave || isSaving || isExitTicket}
                onClick={handleSave}
              >
                {isSaving ? 'Saving…' : 'Save changes'}
              </button>
            </>
          )}
        </div>
      </footer>

      {blocker.state === 'blocked' ? (
        <div
          role="dialog"
          aria-modal
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(15,23,42,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              maxWidth: 400,
              width: '100%',
              background: '#fffefa',
              borderRadius: 12,
              border: '1px solid #d6d5cf',
              padding: 20,
            }}
          >
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
              Leave without saving?
            </p>
            <p className="abv3-subcopy" style={{ marginTop: 8 }}>
              Your changes will be lost.
            </p>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 16,
              }}
            >
              <button
                type="button"
                className="abv3-btn-outline"
                onClick={() => blocker.reset?.()}
              >
                Stay
              </button>
              <button
                type="button"
                className="abv3-btn-primary"
                onClick={() => blocker.proceed?.()}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SnapshotAdvancedGrading({
  submitForGrade,
  onSubmitForGrade,
  pointValue,
  onPointValue,
  strictness,
  onStrictness,
}: {
  submitForGrade: boolean;
  onSubmitForGrade: (value: boolean) => void;
  pointValue: string;
  onPointValue: (value: string) => void;
  strictness: GradingAssistantStrictnessLevel;
  onStrictness: (value: GradingAssistantStrictnessLevel) => void;
}) {
  return (
    <>
      <Abv3Switch
        id="abv3-graded"
        label="Submit for a grade"
        description="Students turn this in for points and feedback."
        checked={submitForGrade}
        onChange={onSubmitForGrade}
      />
      {/* Points and grading assistance only mean something for graded work. */}
      {submitForGrade ? (
        <>
          <div>
            <label htmlFor="abv3-points" className="abv3-field-label">
              Point value
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PointValueInput
                id="abv3-points"
                value={pointValue}
                onChange={onPointValue}
              />
              <span style={{ fontSize: 14, color: 'hsl(50 2.4% 36%)' }}>
                points
              </span>
            </div>
          </div>
          <div>
            <span className="abv3-field-label">Grading assistance</span>
            <div
              role="group"
              aria-label="Grading assistance"
              className="abv3-segment"
            >
              {gradingAssistantStrictnessOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={strictness === option.value}
                  data-pressed={strictness === option.value ? 'true' : 'false'}
                  onClick={() => onStrictness(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="abv3-helper">{strictnessHelper(strictness)}</p>
          </div>
        </>
      ) : null}
    </>
  );
}

function PointValueInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ position: 'relative', width: 88, flex: 'none' }}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        className="abv3-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
