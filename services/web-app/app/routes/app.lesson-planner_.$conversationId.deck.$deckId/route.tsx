/**
 * The deck editor (Brian's review, E2).
 *
 * A teacher may not use every step, so deleting a slide is one click with an
 * Undo, not a dialog. Reorder, duplicate and rewrite any slide, see it in the
 * Yawp! template as it changes, then save: the edit replaces the planner's
 * deck in the chat, in the stack, in Present and in PowerPoint.
 */
import { isKitV4, withDeckKit } from '~/domain/lesson-planner/deck-kit-v4';
import { useActiveTime } from '~/components/lesson-planner/use-active-time';
import { DeckPicturesProvider } from '~/components/lesson-planner/slide-picture';
import type { DeckPictures } from '~/domain/lesson-planner/deck-pictures';
import { viewerDeckPictures } from '~/domain/lesson-planner/deck-pictures.server';
import { useEffect, useRef, useState } from 'react';
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { ChevronLeft, Save } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { prisma } from '~/utils/db.server';
import { requireMutableRequest } from '~/utils/auth.server';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import { loadLessonDeck } from '~/domain/lesson-planner/load-deck.server';
import {
  deckFromEditor,
  deleteSlide,
  updateSlide,
  withoutSlidePicture,
  withSlidePicture,
} from '~/domain/lesson-planner/deck-edit';
import { saveEditedDeck } from '~/domain/lesson-planner/deck-edit.server';
import { resolveDeckPlaces } from '~/domain/lesson-planner/context-slides.server';
import type { Slide, SlideDeck } from '~/domain/lesson-planner/slide-deck';
import { TileSlideCanvas } from '~/routes/present.$conversationId.$messageId/tile-slide-canvas';
import { closeHref } from '~/domain/lesson-planner/lesson-return';
import { GALLERY_FONTS_HREF, GallerySlideCanvas } from '~/routes/present.$conversationId.$messageId/gallery-slide-canvas';
import { DeckStudio } from './deck-studio';
import { DeletedSlideToast, SlideFields, SlideRail } from './editor-parts';

/**
 * Where saving or leaving the editor goes: back to the stack when the edit
 * started there (Brian's run 2: check the stack and edit the deck right
 * there), otherwise back to the chat.
 */
export function deckEditorReturnTo(conversationId: string, url: string) {
  return closeHref(conversationId, url, 'chat');
}

async function requireDeckEditor(request: Request) {
  const access = await getLessonPlannerAccess(request);
  if (!access.allowed) throw redirect('/app');
  const { deckV2, deckGallery, deckKitV4, deckKitV41, activeTime, uploadPictures, deckStudio, deckChat } = await getLessonPlannerReviewFlags(
    access.membership.organization.id
  );
  if (!deckV2) throw new Response('Not Found', { status: 404 });
  return { access, deckGallery, deckKitV4, deckKitV41, activeTime, uploadPictures, deckStudio, deckChat };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { deckGallery, deckKitV4, deckKitV41, activeTime, uploadPictures, deckStudio, deckChat } = await requireDeckEditor(request);
  const { conversationId, lessonTitle, deck } = await loadLessonDeck({
    request,
    conversationId: params.conversationId,
    deckId: params.deckId,
  });
  // The lesson's length, so the editor can keep a running total against it
  // (Brian's run 2, B2). The deck loader already proved this lesson is theirs.
  const lesson = await prisma.lessonPlanConversation.findFirst({
    where: { id: conversationId },
    select: { periodMinutes: true },
  });
  return {
    conversationId,
    deckId: params.deckId!,
    lessonTitle,
    // Drawn in spec v4 where the school has it; saving never stores the kit.
    deck: withDeckKit(deck, { deckKitV4, deckKitV41 }),
    periodMinutes: lesson?.periodMinutes ?? null,
    gallery: deckGallery,
    returnTo: deckEditorReturnTo(conversationId, request.url),
    // The teacher's own pictures on its slides (Nov 1).
    pictures: await viewerDeckPictures(request, [deck]),
    activeTime,
    // Add, replace and remove a slide's picture (Brian, Nov 4).
    pictureUploads: uploadPictures,
    // The deck studio (Nov 19): typed on the slide, for a deck in the kit's v4 look.
    studio: deckStudio,
    // Ask Yawp! in the studio (Nov 19).
    chat: deckChat,
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const { access } = await requireDeckEditor(request);
  const conversation = await prisma.lessonPlanConversation.findFirst({
    where: {
      id: params.conversationId,
      membershipId: access.membership.id,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!conversation) throw new Response('Not Found', { status: 404 });

  const form = await request.formData();
  const checked = deckFromEditor(String(form.get('deck') ?? ''));
  if (!checked.ok) return { error: checked.error };

  const saved = await saveEditedDeck({
    conversationId: conversation.id,
    deckId: params.deckId!,
    // A map slide's places are found again on the way in (Nov 19): what is
    // stored is where Yawp! put them, never what a page sent.
    deck: resolveDeckPlaces(checked.deck),
  });
  if (!saved) throw new Response('Not Found', { status: 404 });
  return redirect(deckEditorReturnTo(conversation.id, request.url));
}


/** How long a deleted slide can still be brought back. */
const UNDO_MS = 8000;

export default function DeckEditorRoute() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  // The studio types on the kit's own layout, so it is for a deck drawn in it.
  if (data.studio && isKitV4(data.deck)) {
    return (
      <DeckStudio
        conversationId={data.conversationId}
        deckId={data.deckId}
        lessonTitle={data.lessonTitle}
        deck={data.deck}
        returnTo={data.returnTo}
        periodMinutes={data.periodMinutes}
        pictures={data.pictures}
        pictureUploads={data.pictureUploads}
        activeTime={data.activeTime}
        chat={data.chat}
        error={actionData && 'error' in actionData ? actionData.error : null}
        saving={navigation.state !== 'idle'}
      />
    );
  }
  return <DeckEditor />;
}

function DeckEditor() {
  const { lessonTitle, deck: loaded, returnTo, periodMinutes, gallery, conversationId, activeTime, pictures, pictureUploads } =
    useLoaderData<typeof loader>();
  // Pictures added here (Brian, Nov 4), shown before the deck is saved.
  const [addedPictures, setAddedPictures] = useState<DeckPictures>({});
  // "Planned in" is working time (Nov 3): editing the deck is planning too.
  useActiveTime({ conversationId, enabled: activeTime });
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [deck, setDeck] = useState<SlideDeck>(loaded);
  const [selected, setSelected] = useState(0);
  const [undo, setUndo] = useState<{ deck: SlideDeck; title: string } | null>(
    null
  );
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  const slide = deck.slides[Math.min(selected, deck.slides.length - 1)]!;
  const at = Math.min(selected, deck.slides.length - 1);

  function edit(patch: Partial<Slide>) {
    setDeck((current) => updateSlide(current, at, patch));
  }

  function remove(index: number) {
    if (deck.slides.length <= 1) return;
    setUndo({ deck, title: deck.slides[index]!.title });
    setDeck(deleteSlide(deck, index));
    setSelected((current) => Math.max(0, Math.min(current, deck.slides.length - 2)));
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  }

  return (
    <DeckPicturesProvider pictures={{ ...pictures, ...addedPictures }}>
    <section className="h-full w-full overflow-y-auto">
      {gallery ? <link rel="stylesheet" href={GALLERY_FONTS_HREF} /> : null}
      <Form method="post" className="mx-auto w-full max-w-7xl px-4 py-6">
        <input type="hidden" name="deck" value={JSON.stringify(deck)} />
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={returnTo}>
              <ChevronLeft size={16} className="mr-1" />
              Back without saving
            </Link>
          </Button>
          <p className="text-sm text-muted-foreground">{lessonTitle}</p>
          <Button
            type="submit"
            size="sm"
            className="ml-auto"
            data-testid="deck-editor-save"
            disabled={navigation.state !== 'idle'}
          >
            <Save size={15} className="mr-1.5" />
            Save deck
          </Button>
        </div>
        {actionData && 'error' in actionData ? (
          <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            This deck can’t be saved yet: {actionData.error}
          </p>
        ) : null}

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Deck title
          </span>
          <input
            value={deck.title}
            maxLength={90}
            onChange={(event) => setDeck({ ...deck, title: event.target.value })}
            className="w-full rounded-lg border bg-background px-3 py-2 text-base font-medium"
          />
        </label>

        <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <SlideRail
            deck={deck}
            at={at}
            periodMinutes={periodMinutes}
            gallery={gallery}
            setDeck={setDeck}
            setSelected={setSelected}
            remove={remove}
          />

          <div className="flex min-w-0 flex-col gap-4">
            <div className="aspect-[16/9] w-full overflow-hidden rounded-xl shadow-sm ring-1 ring-black/5">
              {/* Brian's run 2 (C4): edit the words on the slide itself; the
                  form below edits the same slide, so the two stay in sync. */}
              {gallery ? (
                <GallerySlideCanvas deck={deck} index={at} />
              ) : (
                <TileSlideCanvas slide={slide} onEdit={edit} />
              )}
            </div>

            <SlideFields
              slide={slide}
              gallery={gallery}
              edit={edit}
              conversationId={conversationId}
              pictureUploads={pictureUploads}
              onPicture={(picture) => {
                setAddedPictures((current) => ({ ...current, [picture.id]: picture }));
                setDeck((current) => ({
                  ...current,
                  slides: current.slides.map((entry, index) => (index === at ? withSlidePicture(entry, picture.id) : entry)),
                }));
              }}
              onRemovePicture={() =>
                setDeck((current) => ({
                  ...current,
                  slides: current.slides.map((entry, index) => (index === at ? withoutSlidePicture(entry) : entry)),
                }))
              }
            />
          </div>
        </div>
      </Form>

      {undo ? (
        <DeletedSlideToast
          title={undo.title}
          onUndo={() => {
            setDeck(undo.deck);
            setUndo(null);
          }}
        />
      ) : null}
    </section>
    </DeckPicturesProvider>
  );
}
