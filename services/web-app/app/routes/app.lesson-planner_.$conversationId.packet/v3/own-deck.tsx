/**
 * The teacher's own deck, when they chose "Teach with these slides" (Nov 1):
 * in Print it for class beside everything else the lesson needs, so the file
 * they teach from is one click away rather than somewhere on their drive.
 */
import { Presentation } from 'lucide-react';
import { BUTTON, Row } from './take-to-class';

export type OwnDeck = { id: string; name: string };

export function OwnDeckRows({ decks }: { decks: OwnDeck[] }) {
  return (
    <>
      {decks.map((deck) => (
        <div key={deck.id} data-testid="own-deck">
          <Row icon={<Presentation size={16} />} title="Your slides" line={`${deck.name}, as you uploaded it. The plan points to its slides by number.`}>
            <a href={`/api/lesson-planner-deck/${deck.id}`} download className={BUTTON}>
              Download
            </a>
          </Row>
        </div>
      ))}
    </>
  );
}
