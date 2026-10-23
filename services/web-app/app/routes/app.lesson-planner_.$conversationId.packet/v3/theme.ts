/**
 * The stack page's own look (Kevin's stack page redesign, colors): warm paper,
 * one color per step type, purple reserved for writing. Scoped to the page as
 * CSS variables, so nothing reaches the rest of the app.
 */
import type { CSSProperties } from 'react';
import { STEP_TYPE_COLORS, WRITING_COLOR, WRITING_STRIP, type StepType } from '~/domain/lesson-planner/step-types';

export const STACK_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&display=swap';

export const STACK_THEME: CSSProperties = {
  ['--sv-page' as string]: '#F6F1EA',
  ['--sv-card' as string]: '#FFFDF9',
  ['--sv-ink' as string]: '#1C1A17',
  ['--sv-muted' as string]: '#6E665C',
  ['--sv-line' as string]: '#E7DFD3',
  ['--sv-primary' as string]: '#A8482A',
  ['--sv-coral' as string]: '#E47F5F',
  ['--sv-writing' as string]: WRITING_COLOR,
  ['--sv-writing-strip' as string]: WRITING_STRIP,
  ['--sv-dark' as string]: '#1C1A17',
  ['--sv-dark-panel' as string]: '#2A2622',
  fontFamily: "'Instrument Sans', ui-sans-serif, system-ui, sans-serif",
  color: '#1C1A17',
  backgroundColor: '#F6F1EA',
};

export const HEADING_FONT: CSSProperties = {
  fontFamily: "'Bricolage Grotesque', 'Instrument Sans', ui-sans-serif, system-ui, sans-serif",
};

export function typeChipStyle(type: StepType): CSSProperties {
  const color = STEP_TYPE_COLORS[type];
  return { backgroundColor: color.tint, color: color.text };
}

export function typeBlockStyle(type: StepType): CSSProperties {
  const color = STEP_TYPE_COLORS[type];
  return { backgroundColor: color.tint, color: color.text, borderColor: color.accent };
}
