import type { ClassSimulationAssignmentState } from './class-simulation-mix';
import { CLASS_STARTER_ASSIGNMENT_TYPE_KIND } from '~/domain/assignment-types/class-starter-rubric';
import { DAILY_PAGES_ASSIGNMENT_TYPE_KIND } from '~/domain/assignment-types/daily-pages-rubric';
import { PREWRITING_ASSIGNMENT_TYPE_KIND } from '~/domain/assignment-types/prewriting-assignment-type';
import { THESIS_STATEMENT_ASSIGNMENT_TYPE_KIND } from '~/domain/assignment-types/thesis-statement-assignment-type';

export type SimulationQuality = 'strong' | 'average' | 'weak';

export function countSentences(text: string) {
  return text
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

export function countParagraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

export function classSimulationQuality(studentIndex: number): SimulationQuality {
  const tier = studentIndex % 3;
  if (tier === 0) return 'strong';
  if (tier === 1) return 'average';
  return 'weak';
}

function inProgressDraftKind(
  studentIndex: number,
  assignmentIndex: number
): 'normal' | 'very_short' | 'off_topic' {
  const shortRoll = (studentIndex * 7 + assignmentIndex) % 10;
  if (shortRoll === 5) return 'very_short';
  const offRoll = (studentIndex + assignmentIndex * 3) % 10;
  if (offRoll === 7) return 'off_topic';
  return 'normal';
}

function paragraphsToHtml(paragraphs: string[]) {
  return paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join('');
}

function paragraphsToText(paragraphs: string[]) {
  return paragraphs.join('\n\n');
}

function essayParagraphs(quality: SimulationQuality, studentIndex: number) {
  const topic =
    quality === 'strong'
      ? 'resilience in the face of loss'
      : quality === 'average'
        ? 'growing up between two cultures'
        : 'whether the protagonist makes the right choice';
  const thesis = `In this story, the author uses character choices and imagery to show that ${topic} shapes the ending.`;
  const intro = `${thesis} From the opening scene, the narrator sets up a conflict that feels personal rather than abstract, which makes the theme easier to track.`;
  const evidence =
    quality === 'weak'
      ? `One moment in the middle shows the main character hesitating before speaking. That pause matters because it reveals fear, not just plot movement. The description of the setting also mirrors the character's mood, even if the connection is subtle.`
      : `The middle section proves this claim with two specific scenes. First, the protagonist risks comfort to tell the truth, and the dialogue shows how relationships shift when honesty arrives late. Second, the author repeats images of light and shadow so readers feel the character moving from confusion toward acceptance.`;
  const counter =
    quality === 'strong'
      ? `Some readers might argue the ending is too neat, yet the final image callbacks to the first chapter and shows the character still learning rather than fully healed. That choice keeps the theme believable for a teenage narrator.`
      : `A weaker reading might focus only on the plot twist, but the twist works because the author planted clues about the character's values earlier.`;
  const conclusion = `Overall, the piece argues that ${topic} is not solved in one moment. The final paragraph returns to the thesis and explains why the ending feels earned for this character.`;
  return [intro, evidence, counter, conclusion];
}

function dailyPagesParagraph(quality: SimulationQuality) {
  if (quality === 'strong') {
    return `Today's prompt asked how a small choice can change a week. I kept thinking about when I stayed after class to ask a question I was embarrassed to raise in front of everyone. That choice mattered because it changed how I prepared for the next essay. I noticed I started drafting earlier, reading the passage twice, and writing a one-sentence claim before I touched the introduction. The habit felt awkward at first, but it made feedback from my teacher easier to use. By Friday I could see the difference in how clearly my paragraphs supported my main idea.`;
  }
  if (quality === 'average') {
    return `The daily pages prompt made me reflect on a decision I made this week. I chose to rewrite a paragraph instead of turning in the first draft I finished at lunch. It took longer, but I found a sentence that actually connected my evidence to my claim. I also asked a classmate to read one section aloud, which helped me hear where the wording sounded vague. I still need to tighten my conclusion, yet the process felt more deliberate than usual.`;
  }
  return `I wrote about a choice I made to study before practice even though I was tired. It was hard to start, but once I reread my notes the assignment made more sense. I added one example from the text and explained it in my own words. I also reread the prompt to make sure I answered every part. I know my paragraph still needs a clearer topic sentence, but I finished a full response instead of stopping early.`;
}

function classStarterResponse(quality: SimulationQuality) {
  if (quality === 'strong') {
    return `Our class starter asked us to explain one line that reveals the narrator's attitude. I chose a sentence where the narrator describes the room as "too quiet to be honest." That word honest suggests the speaker already knows someone is hiding something. The line also foreshadows the argument later in the chapter, so it works as both mood and plot setup. I can use this line to start my prewriting because it connects voice and theme in one image.`;
  }
  if (quality === 'average') {
    return `For the class starter I focused on a line about the character watching the door during the conversation. The detail shows nervousness without stating it directly. It also makes the reader wonder who might enter, which adds tension. I will keep this example for my next paragraph because it shows how the author builds suspense through small actions.`;
  }
  return `I picked a line where the character says they "wish the moment would rewind." It shows regret and tells us the character already knows they made a mistake. I think this connects to the theme because the story keeps returning to choices the character cannot undo.`;
}

function prewritingResponse(quality: SimulationQuality) {
  if (quality === 'strong') {
    return `Topic: how the author uses setting to reflect conflict. Possible thesis: The backyard scenes mirror the family argument because open space contrasts with characters who refuse to speak openly. Evidence candidates: the broken fence description, the dinner table scene, and the final night conversation. Questions I still have: whether the weather images are symbolic every time or only in chapter three. Plan: draft introduction with thesis, two body paragraphs with quotes, and a conclusion that returns to setting.`;
  }
  if (quality === 'average') {
    return `I am prewriting about the character's relationship with their sibling. My working claim is that small gestures matter more than big speeches in this chapter. I listed two quotes where they share food or music, plus one scene where they argue about college plans. I need one more piece of evidence from the ending. Next step is to turn this list into a thesis and check whether my examples actually prove tension and repair.`;
  }
  return `My prewriting is about the main conflict and what the character wants. I wrote down two quotes and a question about why the character changes their mind at the end. I still need to decide which quote is strongest for the first body paragraph.`;
}

function thesisStatementResponse(quality: SimulationQuality) {
  if (quality === 'strong') {
    return `Through repeated images of doors and thresholds, the author argues that growing up requires choosing uncomfortable honesty over comfortable silence. The final scene confirms this claim when the narrator finally speaks directly to their parent instead of avoiding the conversation. I can support this thesis with the hallway scene and the closing paragraph.`;
  }
  if (quality === 'average') {
    return `The author uses dialogue and setting to show that the protagonist learns to take responsibility. This is clearest in the last conversation before the ending, where the character admits a mistake out loud. My essay will focus on that scene and one earlier moment of hesitation.`;
  }
  return `The story shows that the main character changes because of one decision they make in the middle of the chapter. That decision affects how they treat their friend in the final pages. I still need to tighten the wording, but the claim is specific enough to guide my draft.`;
}

function inProgressNormal(quality: SimulationQuality) {
  if (quality === 'strong') {
    return `My claim is that the author builds tension through contrast between public calm and private doubt. I still need to tie the second paragraph back to the thesis with a clearer quote.`;
  }
  if (quality === 'average') {
    return `I think my opening explains the topic, but the middle paragraph drifts. I am trying to add evidence from the scene where the narrator hesitates.`;
  }
  return `I started my thesis but I am not sure my example fits yet. I need help connecting the quote to my claim.`;
}

export function buildSimulationDocumentContent(params: {
  assignmentTypeKind: string | null | undefined;
  state: ClassSimulationAssignmentState;
  studentIndex: number;
  assignmentIndex: number;
}): { text: string; html: string } {
  const quality = classSimulationQuality(params.studentIndex);
  const kind = params.assignmentTypeKind ?? 'essay';

  if (params.state === 'joined' || params.state === 'not_joined') {
    return { text: '', html: '' };
  }

  if (params.state === 'in_progress') {
    const draft = inProgressDraftKind(params.studentIndex, params.assignmentIndex);
    let text =
      draft === 'very_short'
        ? 'I started my claim but need more evidence.'
        : draft === 'off_topic'
          ? 'This reminds me of a video game I played last weekend, not sure if it fits.'
          : inProgressNormal(quality);
    if (draft === 'off_topic' && params.studentIndex % 2 === 0) {
      text =
        'I was thinking about soccer practice and music rehearsal instead of the reading.';
    }
    return { text, html: `<p>${text}</p>` };
  }

  let paragraphs: string[];
  if (kind === DAILY_PAGES_ASSIGNMENT_TYPE_KIND) {
    paragraphs = [dailyPagesParagraph(quality)];
  } else if (kind === CLASS_STARTER_ASSIGNMENT_TYPE_KIND) {
    paragraphs = [classStarterResponse(quality)];
  } else if (kind === PREWRITING_ASSIGNMENT_TYPE_KIND) {
    paragraphs = [prewritingResponse(quality)];
  } else if (kind === THESIS_STATEMENT_ASSIGNMENT_TYPE_KIND) {
    paragraphs = [thesisStatementResponse(quality)];
  } else {
    paragraphs = essayParagraphs(quality, params.studentIndex);
  }

  const text = paragraphsToText(paragraphs);
  const html = paragraphsToHtml(paragraphs);
  return { text, html };
}
