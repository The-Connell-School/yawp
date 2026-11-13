export function assignmentBuilderV3ShowGroupProjectToggle(input: {
  collaborationSupported: boolean;
  isEdit: boolean;
  editingCollaborationEnabled: boolean;
}) {
  if (!input.collaborationSupported) return false;
  if (input.isEdit) return input.editingCollaborationEnabled;
  return true;
}
