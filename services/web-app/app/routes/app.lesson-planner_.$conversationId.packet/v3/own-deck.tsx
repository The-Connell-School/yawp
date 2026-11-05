/**
 * The teacher's own deck, when they chose "Add my existing slide deck to the
 * stack as is" (Nov 1, Nov 3): the file they teach from, one click away in
 * Print it for class. With no Yawp! deck in the lesson it is the lesson's
 * slide deck; beside one, it sits under it as their own.
 */
import { Presentation } from 'lucide-react';
import { BUTTON, Row } from './take-to-class';

export type OwnDeck = { id: string; name: string };

export function OwnDeckRows({ decks, asLessonDeck = false }: { decks: OwnDeck[]; asLessonDeck?: boolean }) {
  return (
    <>
      {decks.map((deck) => (
        <div key={deck.id} data-testid="own-deck">
          <Row
            icon={<Presentation size={16} />}
            title={asLessonDeck ? 'Slide deck' : 'Your own slide deck'}
            line={`Your own deck, as you uploaded it: ${deck.name}. The plan points to its slides by number.`}
          >
            <a href={`/api/lesson-planner-deck/${deck.id}`} download className={BUTTON}>
              Download
            </a>
          </Row>
        </div>
      ))}
    </>
  );
}
