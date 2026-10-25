/**
 * "What do I still need to do?" (Kevin, Oct 25, note 12a): a short list that
 * ticks itself off from the lesson as it is. Nothing here is typed in.
 */

export type BeforeClassItem = { key: string; label: string; done: boolean };

export function beforeClass({
  over,
  period,
  deck,
  missingWriting,
  lessonDate,
}: {
  over: number;
  period: number | null;
  deck: { built: boolean; stale: boolean };
  /** Writing steps not made in Yawp! and not marked for paper. */
  missingWriting: number;
  lessonDate: string | null;
}): { items: BeforeClassItem[]; ready: boolean } {
  const items: BeforeClassItem[] = [
    {
      key: 'fits',
      label: !period ? 'Pick the period length' : over > 0 ? `Fits the period (${over} min over now)` : 'Fits the period',
      done: Boolean(period) && over <= 0,
    },
    {
      key: 'slides',
      label: deck.stale ? 'Slides up to date (the lesson changed)' : 'Slides built',
      done: deck.built && !deck.stale,
    },
    {
      key: 'writing',
      label: missingWriting
        ? `Writing made in Yawp! or on paper (${missingWriting} to go)`
        : 'Writing made in Yawp! or on paper',
      done: missingWriting === 0,
    },
    { key: 'date', label: 'Date picked', done: Boolean(lessonDate) },
  ];
  return { items, ready: items.every((item) => item.done) };
}

export const READY_LINE =
  'Open the slideshow on the smartboard, and the run of show with teacher notes on your laptop.';
