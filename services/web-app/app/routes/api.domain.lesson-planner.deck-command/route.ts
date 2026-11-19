/**
 * Ask Yawp! in the deck studio (Nov 19): a line about the deck in the editor,
 * answered with the deck changed and a list of what changed. Behind
 * `lesson_planner_deck_chat` (which needs the deck studio), for the teacher's
 * own lesson. Nothing is saved here: the page shows the deck that comes back
 * and the teacher saves it.
 */
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireMutableRequest } from '~/utils/auth.server';
import { AiRateLimitError, aiAdmissionErrorResponse } from '~/utils/ai-admission.server';
import { requireLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { lessonPlannerRateLimitMessage } from '~/utils/lesson-planner/lesson-planner-admission.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import { withDeckKit } from '~/domain/lesson-planner/deck-kit-v4';
import { readDeckSelection } from '~/domain/lesson-planner/deck-command';
import { runDeckCommand } from '~/domain/lesson-planner/deck-command.server';
import { validateSlideDeck } from '~/domain/lesson-planner/slide-deck';
import { readBoundedBytes } from '~/utils/bounded-body.server';

/** A deck is 40 short slides; this is several times the largest. */
const MAX_BODY_BYTES = 400 * 1024;
const MAX_LINE = 600;

function bad(message: string, status = 400) {
  return dataResponse({ error: message }, { status });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const access = await requireLessonPlannerAccess(request);
  const flags = await getLessonPlannerReviewFlags(access.membership.organization.id);
  if (!flags.deckChat) return bad('Not found.', 404);

  const bytes = await readBoundedBytes(request, MAX_BODY_BYTES);
  if (bytes === null) return bad('That deck is too large to change here.', 413);
  const form = new URLSearchParams(new TextDecoder().decode(bytes));

  const conversation = await prisma.lessonPlanConversation.findFirst({
    where: { id: form.get('conversationId') ?? '', membershipId: access.membership.id, deletedAt: null },
    select: { id: true, periodMinutes: true },
  });
  if (!conversation) return bad('Lesson not found.', 404);

  const line = (form.get('line') ?? '').trim();
  if (!line) return bad('Say what to change.');
  if (line.length > MAX_LINE) return bad('That is a lot for one change. Try it in two.');

  // The deck as the page has it, held to the same rules a saved deck meets.
  const checked = validateSlideDeck(form.get('deck') ?? '');
  if (!checked.ok) return bad('Finish what you are typing on the slide, then ask again.', 422);
  // Drawn, and so written, in the school's own deck spec: never the page's say.
  const deck = withDeckKit(checked.deck, flags);

  try {
    const outcome = await runDeckCommand({
      request,
      access,
      deck,
      line,
      selection: readDeckSelection(form.get('selection') ?? '', deck),
      periodMinutes: conversation.periodMinutes,
    });
    return dataResponse({ ok: true, ...outcome });
  } catch (error) {
    const locked = aiAdmissionErrorResponse(error);
    if (locked) return locked;
    if (error instanceof AiRateLimitError) {
      return dataResponse({ error: lessonPlannerRateLimitMessage(error) }, { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } });
    }
    return bad('Yawp! could not make that change just now. Try again.', 503);
  }
}
