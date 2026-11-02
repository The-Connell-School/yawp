import { describe, expect, test } from 'bun:test';
import { downloadName, isFile } from './download-link';

const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name.toLowerCase()] ?? null });

describe('downloads that show they work (Kevin, Oct 25, note 10b)', () => {
  test('saves only a real file, never an error page or a message', () => {
    expect(isFile({ ok: true, headers: headers({ 'content-type': 'application/pdf' }) })).toBe(true);
    expect(isFile({ ok: true, headers: headers({ 'content-type': 'text/html; charset=utf-8' }) })).toBe(false);
    expect(isFile({ ok: false, headers: headers({ 'content-type': 'application/pdf' }) })).toBe(false);
    expect(isFile({ ok: false, headers: headers({ 'content-type': 'text/plain' }) })).toBe(false);
  });

  test("the file's own name, the encoded one first", () => {
    expect(downloadName(`attachment; filename="Day_One.pdf"; filename*=UTF-8''Day%20One%20%E2%80%94%20Handout.pdf`, '/x/handouts.pdf')).toBe(
      'Day One - Handout.pdf'
    );
    expect(downloadName(`attachment; filename*=UTF-8''Dulc%C3%A9%20%E2%80%9Cquoted%E2%80%9D%20%E2%80%93%20x.pdf`, '/x')).toBe('Dulce quoted - x.pdf');
    expect(downloadName('attachment; filename="Plan.docx"', '/x/plan.docx')).toBe('Plan.docx');
    expect(downloadName(null, '/app/lesson-planner/1/plan.pdf?x=1')).toBe('plan.pdf');
  });
});
