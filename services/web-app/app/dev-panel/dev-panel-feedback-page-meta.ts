import { pe3FreeTierRowValue } from './dev-panel-pe3-states';

export function devPanelFeedbackPageMeta(args: {
  path: string;
  signedIn: boolean;
  roleLabel: string;
  selectedStateId: string | null | undefined;
}) {
  const pathLabel = args.path || '/';
  if (!args.signedIn) {
    return `Page: ${pathLabel} · Signed out`;
  }
  const tier = pe3FreeTierRowValue(args.selectedStateId);
  const role = args.roleLabel || 'User';
  return `Page: ${pathLabel} · ${role} · ${tier}`;
}
