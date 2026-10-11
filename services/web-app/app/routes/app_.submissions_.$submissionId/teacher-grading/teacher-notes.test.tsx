/** @jsxImportSource react */
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeacherNotes } from './teacher-notes';

describe('TeacherNotes', () => {
  test('renders nothing when hidden', () => {
    expect(
      renderToStaticMarkup(<TeacherNotes ui={{ visible: false }} />)
    ).toBe('');
  });

  test('renders pending copy before a grading run', () => {
    const html = renderToStaticMarkup(
      <TeacherNotes ui={{ visible: true, phase: 'pending' }} />
    );
    expect(html).toContain('Teacher Context');
    expect(html).toContain('Not visible to students');
    expect(html).toContain(
      'Teacher notes will appear here after the Grading Assistant runs.'
    );
  });

  test('renders empty copy after a successful run without a note', () => {
    const html = renderToStaticMarkup(
      <TeacherNotes ui={{ visible: true, phase: 'empty' }} />
    );
    expect(html).toContain(
      'No notes for you on this one. Nothing in the writing stood out as inconsistent.'
    );
  });

  test('renders note bullets when content is present', () => {
    const html = renderToStaticMarkup(
      <TeacherNotes
        ui={{
          visible: true,
          phase: 'content',
          note: 'Vocabulary shifts in the closing paragraph.',
        }}
      />
    );
    expect(html).toContain('Vocabulary shifts in the closing paragraph.');
  });
});
