import { createCookie } from 'react-router';
import { DOCUMENT_EDITOR_V2_FLAG } from './document-editor-v2-flag';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { hasEffectivePlatformAdmin } from '~/utils/preview-access.server';

export const DOCUMENT_EDITOR_V2_FORCE_COOKIE = 'yawp_document_editor_v2';

const documentEditorV2ForceCookie = createCookie(DOCUMENT_EDITOR_V2_FORCE_COOKIE, {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 30,
});

export type DocumentEditorV2GateInput = {
  request: Request;
  isStaff: boolean;
};

/** Setting row + deployment defaults (demo/preview). Fails closed. */
export async function isDocumentEditorV2RolloutEnabled(): Promise<boolean> {
  return isFeatureFlagEnabled(DOCUMENT_EDITOR_V2_FLAG, null);
}

export async function isDocumentEditorV2StaffOverride(
  request: Request,
  isPlatformAdmin: boolean
): Promise<boolean> {
  if (!isPlatformAdmin) return false;
  const url = new URL(request.url);
  if (url.searchParams.get('editor') === 'v2') {
    return true;
  }
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return false;
  const value = await documentEditorV2ForceCookie.parse(cookieHeader);
  return value === '1';
}

/** Whether the document route should render editor v2 for this request. */
export async function resolveDocumentEditorV2Enabled({
  request,
  isStaff: isPlatformAdmin,
}: DocumentEditorV2GateInput): Promise<boolean> {
  if (await isDocumentEditorV2RolloutEnabled()) return true;
  return isDocumentEditorV2StaffOverride(request, isPlatformAdmin);
}

export function isStaffForDocumentEditorOverride(isAdmin?: boolean | null) {
  return hasEffectivePlatformAdmin(isAdmin);
}

export { documentEditorV2ForceCookie };