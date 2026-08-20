import { describe, expect, test } from 'bun:test';
import {
  AUTHOR_COLORS,
  authorColor,
  buildAuthorColorScale,
  UNATTRIBUTED_COLOR,
} from './author-colors';

describe('buildAuthorColorScale', () => {
  test('never gives two writers in a group the same colour', () => {
    // The bug this replaces: colour was hash(id) % 8, which collides outright
    // on about a third of three-person groups. Not "similar" — the same colour.
    const ids = Array.from({ length: AUTHOR_COLORS.length }, (_, i) => `m-${i}`);
    const scale = buildAuthorColorScale(ids);

    expect(new Set(scale.values()).size).toBe(AUTHOR_COLORS.length);
  });

  test('gives a typical group the most separated colours in the palette', () => {
    // The palette is ordered by separation, so a group of three takes the first
    // three — the ones that are hardest to confuse.
    const scale = buildAuthorColorScale(['a', 'b', 'c']);

    expect([...scale.values()]).toEqual([
      AUTHOR_COLORS[0],
      AUTHOR_COLORS[1],
      AUTHOR_COLORS[2],
    ]);
  });

  test('agrees between two surfaces listing the same people', () => {
    // A student's colour in their own editor and in the teacher's panel have to
    // match, and the two pages build their lists from different queries.
    const roster = ['m-3', 'm-1', 'm-2'];
    const teacherView = buildAuthorColorScale(roster);
    const studentView = buildAuthorColorScale(roster);

    expect([...studentView.entries()]).toEqual([...teacherView.entries()]);
  });

  test('keeps current members ahead of someone who left the group', () => {
    // A former student's text still renders, but the people being graded should
    // get the colours that are easiest to tell apart.
    const scale = buildAuthorColorScale(['current-1', 'current-2', 'former']);

    expect(scale.get('current-1')).toBe(AUTHOR_COLORS[0]);
    expect(scale.get('current-2')).toBe(AUTHOR_COLORS[1]);
    expect(scale.get('former')).toBe(AUTHOR_COLORS[2]);
  });

  test('ignores a repeated id rather than spending a colour on it', () => {
    const scale = buildAuthorColorScale(['a', 'b', 'a']);

    expect(scale.size).toBe(2);
    expect(scale.get('a')).toBe(AUTHOR_COLORS[0]);
    expect(scale.get('b')).toBe(AUTHOR_COLORS[1]);
  });

  test('wraps deterministically past the palette rather than running out', () => {
    // Beyond eight writers a repeat is unavoidable; what matters is that both
    // surfaces repeat identically, so the wrapped tail is ordered by id.
    const many = Array.from({ length: 10 }, (_, i) => `m-${i}`);
    const forwards = buildAuthorColorScale(many);
    const backwards = buildAuthorColorScale([
      ...many.slice(0, AUTHOR_COLORS.length),
      ...many.slice(AUTHOR_COLORS.length).reverse(),
    ]);

    expect(forwards.get('m-8')).toBe(backwards.get('m-8'));
    expect(forwards.get('m-9')).toBe(backwards.get('m-9'));
    expect(forwards.get('m-8')).toBe(AUTHOR_COLORS[0]);
  });

  test('every colour is dark enough for the white initials on it', () => {
    // The swatches carry initials in white; a light one would make them vanish.
    for (const color of AUTHOR_COLORS) {
      expect(contrastWithWhite(color)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('no two colours in a group of four are close in CIE Lab', () => {
    // The complaint that started this: two colours almost identical on screen.
    // 24 is comfortably past the ~10 where two colours start reading as one.
    const four = AUTHOR_COLORS.slice(0, 4);
    for (let i = 0; i < four.length; i += 1) {
      for (let j = i + 1; j < four.length; j += 1) {
        expect(labDistance(four[i]!, four[j]!)).toBeGreaterThan(24);
      }
    }
  });

  test('grey is reserved for text nobody is recorded as writing', () => {
    expect(AUTHOR_COLORS).not.toContain(UNATTRIBUTED_COLOR as never);
  });
});

describe('authorColor', () => {
  test('reads a writer out of the scale', () => {
    const scale = buildAuthorColorScale(['a', 'b']);

    expect(authorColor(scale, 'b')).toBe(AUTHOR_COLORS[1]);
  });

  test('greys out unattributed text and unknown writers', () => {
    // Inventing a colour risks handing someone a colour a classmate already has.
    const scale = buildAuthorColorScale(['a']);

    expect(authorColor(scale, null)).toBe(UNATTRIBUTED_COLOR);
    expect(authorColor(scale, 'nobody')).toBe(UNATTRIBUTED_COLOR);
  });
});

function channels(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

function contrastWithWhite(hex: string) {
  const [r, g, b] = channels(hex).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  );
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return 1.05 / (luminance + 0.05);
}

/** Plain CIE76 ΔE — enough to catch two colours that read as one. */
function labDistance(a: string, b: string) {
  const toLab = (hex: string) => {
    const [r, g, bb] = channels(hex).map((c) =>
      c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    );
    const x = (r! * 0.4124 + g! * 0.3576 + bb! * 0.1805) / 0.95047;
    const y = r! * 0.2126 + g! * 0.7152 + bb! * 0.0722;
    const z = (r! * 0.0193 + g! * 0.1192 + bb! * 0.9505) / 1.08883;
    const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  };
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1! - l2!, a1! - a2!, b1! - b2!);
}
