import { Checkbox } from '~/components/ui/checkbox';
import { Label } from '~/components/ui/label';
import {
  COLLABORATION_GROUP_MODE_OPTIONS,
  COLLABORATION_GROUP_SIZE_OPTIONS,
  collaborationModeNeedsGroupSize,
  type CollaborationGroupMode,
} from '~/domain/assignments/collaboration';

type AssignmentCollaborationFieldsProps = {
  isEditing?: boolean;
  isSaving: boolean;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  groupMode: CollaborationGroupMode;
  onGroupModeChange: (mode: CollaborationGroupMode) => void;
  groupSize: number;
  onGroupSizeChange: (size: number) => void;
};

/** Shared by every assignment-creation path, including curated AP History. */
export function AssignmentCollaborationFields({
  isEditing = false,
  isSaving,
  enabled,
  onEnabledChange,
  groupMode,
  onGroupModeChange,
  groupSize,
  onGroupSizeChange,
}: AssignmentCollaborationFieldsProps) {
  return (
    <div className="pt-6">
      {isEditing ? null : (
        <input type="hidden" name="collaborationEnabled" value="false" />
      )}
      <div className="flex items-center gap-2.5">
        <Checkbox
          id="assignment-create-collaboration-enabled"
          name={isEditing ? undefined : 'collaborationEnabled'}
          value="true"
          checked={enabled}
          onCheckedChange={(checked) => onEnabledChange(checked === true)}
          disabled={isSaving || isEditing}
          className="size-4 shrink-0"
        />
        <Label
          htmlFor="assignment-create-collaboration-enabled"
          className={
            isEditing
              ? 'font-normal leading-none text-muted-foreground'
              : 'cursor-pointer font-normal leading-none'
          }
        >
          Is this a collaborative assignment?
        </Label>
      </div>
      <p className="mt-1 pl-[calc(1rem+0.625rem)] text-sm text-muted-foreground">
        {isEditing
          ? 'Collaboration cannot be switched on or off after an assignment is created — groups may already be writing in shared drafts.'
          : 'You must assign every student to a group before students can open this assignment. You can arrange groups yourself, shuffle automatically, or use the whole class. Students cannot create groups, move themselves, or create shared documents. When you finalize the groups, Yawp creates one shared document for each group.'}
      </p>
      {enabled && !isEditing ? (
        <div className="mt-3 space-y-3 pl-[calc(1rem+0.625rem)]">
          <input
            type="hidden"
            name="collaborationGroupMode"
            value={groupMode}
          />
          <div className="space-y-2">
            <Label>How should groups be made?</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {COLLABORATION_GROUP_MODE_OPTIONS.map((option) => {
                const selected = groupMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`h-full rounded-md border px-3 py-2 text-left text-sm transition ${
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:bg-muted'
                    }`}
                    aria-pressed={selected}
                    onClick={() => onGroupModeChange(option.value)}
                    disabled={isSaving}
                  >
                    <span className="block font-medium">{option.label}</span>
                    <span
                      className={`mt-1 block text-xs ${
                        selected
                          ? 'text-primary-foreground/80'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {collaborationModeNeedsGroupSize(groupMode) ? (
            <div>
              <Label
                htmlFor="assignment-create-collaboration-group-size"
                className="font-normal leading-none"
              >
                Students per group
              </Label>
              <select
                id="assignment-create-collaboration-group-size"
                name="collaborationGroupSize"
                value={groupSize}
                onChange={(event) =>
                  onGroupSizeChange(Number(event.target.value))
                }
                disabled={isSaving}
                className="mt-1 block rounded border px-2 py-1 text-sm"
              >
                {COLLABORATION_GROUP_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
