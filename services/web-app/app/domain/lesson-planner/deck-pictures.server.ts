/**
 * Loading the teacher's own pictures for a deck (Nov 1), only ever theirs.
 *
 * Screens get what an <img> needs (alt text and shape); the PowerPoint and
 * PDF renderers get the bytes too. A picture that is not this teacher's is
 * simply absent, and the renderer draws its placeholder.
 */
import { prisma } from '~/utils/db.server';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { containBox, PICTURE_PLACEHOLDER, type Box, type DeckPicture, type DeckPictures } from './deck-pictures';
import { deckPictureIds, parseSlideDeck, type SlideDeck } from './slide-deck';

export type DeckPictureFile = DeckPicture & { contentType: string; data: Buffer };
export type DeckPictureFiles = Map<string, DeckPictureFile>;

function idsOf(decks: Array<Pick<SlideDeck, 'slides'> | null | undefined>): string[] {
  return [...new Set(decks.flatMap((deck) => (deck ? deckPictureIds(deck) : [])))];
}

/** Alt text and shape for every picture these decks show that is this teacher's. */
export async function loadDeckPictures(
  decks: Array<Pick<SlideDeck, 'slides'> | null | undefined>,
  membershipId: string | null | undefined
): Promise<DeckPictures> {
  const ids = idsOf(decks);
  if (!ids.length || !membershipId) return {};
  const rows = await prisma.lessonPlanUploadPicture.findMany({
    where: { id: { in: ids }, membershipId },
    select: { id: true, altText: true, width: true, height: true },
  });
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

/** The bytes too, for a file that carries its pictures with it. */
export async function loadDeckPictureFiles(
  decks: Array<Pick<SlideDeck, 'slides'> | null | undefined>,
  membershipId: string | null | undefined
): Promise<DeckPictureFiles> {
  const ids = idsOf(decks);
  if (!ids.length || !membershipId) return new Map();
  const rows = await prisma.lessonPlanUploadPicture.findMany({
    where: { id: { in: ids }, membershipId },
    select: { id: true, altText: true, width: true, height: true, contentType: true, blob: true },
  });
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        altText: row.altText,
        width: row.width,
        height: row.height,
        contentType: row.contentType,
        data: Buffer.from(row.blob),
      },
    ])
  );
}

/** A picture as a data URL body for pptxgenjs: "image/png;base64,…". */
export function pptxImageData(file: Pick<DeckPictureFile, 'contentType' | 'data'>): string {
  return `${file.contentType};base64,${file.data.toString('base64')}`;
}

type PptxSlideLike = {
  addImage(options: Record<string, unknown>): unknown;
  addShape(shape: never, options: Record<string, unknown>): unknown;
  addText(text: string, options: Record<string, unknown>): unknown;
};

/**
 * One picture on a PowerPoint slide, whole inside `box` (inches), with its alt
 * text; or, when this file may not carry it, a dashed frame that says so.
 * Shared by the plain, tile and gallery decks so all three agree.
 */
export function addPptxPicture(
  slide: PptxSlideLike,
  picture: DeckPictureFile | undefined,
  box: Box,
  style: { rule: string; muted: string; fontFace?: string }
): void {
  if (picture) {
    const fit = containBox(box, picture);
    slide.addImage({ data: pptxImageData(picture), ...fit, altText: picture.altText || undefined });
    return;
  }
  slide.addShape('rect' as never, { ...box, fill: { type: 'none' }, line: { color: style.rule, width: 1, dashType: 'dash' } });
  slide.addText(PICTURE_PLACEHOLDER, {
    ...box,
    align: 'center',
    valign: 'middle',
    fontSize: 14,
    color: style.muted,
    ...(style.fontFace ? { fontFace: style.fontFace } : {}),
  });
}

/** The signed-in teacher's membership, or null for anyone else. */
async function viewerMembershipId(request: Request): Promise<string | null> {
  const access = await getLessonPlannerAccess(request);
  return access.allowed ? access.membership.id : null;
}

/** For a screen: the pictures these decks show that the viewer owns. */
export async function viewerDeckPictures(
  request: Request,
  decks: Array<Pick<SlideDeck, 'slides'> | null | undefined>
): Promise<DeckPictures> {
  if (!idsOf(decks).length) return {};
  return loadDeckPictures(decks, await viewerMembershipId(request));
}

/** For a file: the bytes of the pictures these decks show that the viewer owns. */
export async function viewerDeckPictureFiles(
  request: Request,
  decks: Array<Pick<SlideDeck, 'slides'> | null | undefined>
): Promise<DeckPictureFiles> {
  if (!idsOf(decks).length) return new Map();
  return loadDeckPictureFiles(decks, await viewerMembershipId(request));
}

/** The decks among these replies that show a picture; the rest are not parsed. */
export function picturedDecks(contents: string[]): SlideDeck[] {
  return contents.flatMap((content) => {
    if (!content.includes('"image"')) return [];
    const deck = parseSlideDeck(content)?.deck;
    return deck && deckPictureIds(deck).length ? [deck] : [];
  });
}

