/**
 * The slide shapes the hybrid Thesis-Driven Essay decks use.
 *
 * Text fields accept two light marks, so the content reads like prose:
 * - `==words==` wears Brian's yellow highlighter;
 * - `**words**` is bold in the slide's accent colour (the questions in a
 *   pre-write example, a key term).
 */
import type { AccentColor, IconName } from './hybrid-theme';

/** An image in `assets/`, by file name. */
export type AssetImage =
  | 'fallen-man.jpg'
  | 'critical-essay-form.png'
  | 'yawp-editor-prewriting.png'
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
    });

export interface HybridDeck {
  title: string;
  subtitle: string;
  slides: HybridSlide[];
}
