import {
  DOCUMENT_EDITOR_V2_FLAG,
  type FeatureFlagKey,
} from '~/domain/feature-flags/feature-flags';

export { DOCUMENT_EDITOR_V2_FLAG };

export function isDocumentEditorV2FlagKey(
  key: FeatureFlagKey
): key is typeof DOCUMENT_EDITOR_V2_FLAG {
  return key === DOCUMENT_EDITOR_V2_FLAG;
}