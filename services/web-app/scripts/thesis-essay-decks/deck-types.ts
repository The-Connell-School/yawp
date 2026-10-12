/**
 * The slide shapes the hybrid Thesis-Driven Essay decks use.
 *
 * Text fields accept two light marks, so the content reads like prose:
 * - `==words==` wears Brian's yellow highlighter;
 * - `**words**` is bold in the slide's accent colour (the questions in a
 *   pre-write example, a key term);
 * - `__words__` is italic (a thesis inside a sample paragraph).
 */
import type { AccentColor, IconName } from './hybrid-theme';

/** An image in `assets/`, by file name. */
export type AssetImage =
  | 'fallen-man.jpg'
  | 'elephant.jpg'
  | 'critical-essay-form.png'
  | 'yawp-editor-prewriting.png'
  | 'yawp-editor-thesis.png'
  | 'yawp-editor-introduction.png'
  | 'yawp-editor-body.png'
  | 'yawp-editor-conclusion.png'
  | 'yawp-editor-final.png'
  | 'brian-twins.jpg'
  | 'brian-1990s.jpg'
  | 'yawp-join-link-card.png'
  | 'yawp-join-page.png'
  | 'yawp-student-dashboard.png'
  | 'yawp-my-documents.png';

interface BaseSlide {
  /** Said small and mono above the title: what the slide is for. */
  eyebrow: string;
  /** Only the teacher sees these. Every slide has them. */
  notes: string;
  accent?: AccentColor;
}

export type HybridSlide =
  | (BaseSlide & { layout: 'title'; title: string; subtitle: string })
  | (BaseSlide & { layout: 'section'; kicker: string; title: string; line?: string })
  | (BaseSlide & { layout: 'statement'; title: string; body: string; icon?: IconName })
  | (BaseSlide & {
      layout: 'steps';
      title: string;
      intro?: string;
      items: string[];
      /** A wide screenshot strip under the tiles. */
      strip?: AssetImage;
    })
  | (BaseSlide & {
      layout: 'photo';
      title: string;
      image: AssetImage;
      /** Short lines down the side of the photo: prompts or questions. */
      lines: string[];
      icon?: IconName;
    })
  | (BaseSlide & {
      layout: 'quote';
      title: string;
      body: string;
      attribution: string;
      image?: AssetImage;
    })
  | (BaseSlide & { layout: 'prompt'; title: string; body: string; label: string })
  | (BaseSlide & {
      layout: 'figure';
      title: string;
      image: AssetImage;
      /** Beside the figure: what to point at. */
      callouts: string[];
    })
  | (BaseSlide & {
      layout: 'compare';
      title: string;
      left: { label: string; accent: AccentColor; lines: string[] };
      right: { label: string; accent: AccentColor; lines: string[] };
      sticker?: string;
    })
  | (BaseSlide & { layout: 'example'; title: string; body: string })
  | (BaseSlide & { layout: 'grid'; title: string; items: string[] })
  | (BaseSlide & { layout: 'timer'; title: string; minutes: number; line: string })
  | (BaseSlide & {
      layout: 'equation';
      title: string;
      terms: [string, string];
      result: string;
      line: string;
    })
  | (BaseSlide & {
      /** A review question. With `answer`, the right option is highlighted. */
      layout: 'quiz';
      title: string;
      options: string[];
      answer?: number;
    })
  | (BaseSlide & {
      /** A list to put in order; `numbered` is the reveal. */
      layout: 'ordering';
      title: string;
      items: string[];
      numbered?: boolean;
    })
  | (BaseSlide & {
      /** Observation and analysis side by side, and the thesis they make. */
      layout: 'oa';
      title: string;
      observation: string;
      analysis: string[];
      thesis?: string;
    })
  | (BaseSlide & {
      /** A thesis with each part in its own colour, and the parts listed. */
      layout: 'thesis-parts';
      title: string;
      thesis: string;
      /** `span` is the exact text inside `thesis`; `label` is what it becomes. */
      parts: { span: string; label: string }[];
    })
  | (BaseSlide & {
      /** A long passage from a sample essay, with a label on its tile. */
      layout: 'passage';
      title: string;
      label?: string;
      body: string;
    })
  | (BaseSlide & { layout: 'closer'; line?: string });

export interface HybridDeck {
  title: string;
  subtitle: string;
  slides: HybridSlide[];
}
