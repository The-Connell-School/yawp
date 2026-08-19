export function firstNameFromFullName(name: string | null | undefined) {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'Student';
  const first = trimmed.split(/\s+/)[0]?.trim();
  return first || 'Student';
}

/**
 * Who a piece of grading feedback is addressed to.
 *
 * The assistant is told to open its overall comment with this name, which is
 * right for a solo essay and wrong for a group brief: `Document.membershipId`
 * is single-valued, so on a shared draft it names whichever member happens to
 * be first in the group. Feedback on work three students wrote was opening
 * "Fen," — addressed to one of them, in front of all of them.
 *
 * A group is addressed by its label, which is what both the teacher and the
 * students already see for it everywhere else in the product.
 */
export function gradingAddressee({
  studentName,
  groupLabel,
}: {
  studentName?: string | null;
  groupLabel?: string | null;
}) {
  const group = groupLabel?.trim();
  if (group) return group;
  return firstNameFromFullName(studentName);
}
