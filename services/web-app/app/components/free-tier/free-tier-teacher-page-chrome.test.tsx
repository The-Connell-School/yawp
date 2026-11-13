import { afterAll, describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';

const useUser = mock(() => ({
  selectedMembership: { role: 'TEACHER' as const },
}));

mock.module('~/hooks/useUser', () => ({ useUser }));

const {
  useFreeTierLockedB2PageChrome,
  useFreeTierStandardPageShell,
} = await import('./free-tier-teacher-page-chrome');

afterAll(() => mock.restore());

function renderTeacherChromeFlags() {
  function Probe() {
    const b2 = useFreeTierLockedB2PageChrome();
    const shell = useFreeTierStandardPageShell();
    return `${b2}-${shell}`;
  }
  return renderToStaticMarkup(
    <StaticRouter location="/app/assignments">
      <Probe />
    </StaticRouter>
  );
}

describe('teacher page chrome hooks', () => {
  test('enabled for teachers without freeAccountUsage', () => {
    useUser.mockReturnValue({
      selectedMembership: { role: 'TEACHER' },
    });
    expect(renderTeacherChromeFlags()).toBe('true-true');
  });

  test('disabled for students', () => {
    useUser.mockReturnValue({
      selectedMembership: { role: 'STUDENT' },
    } as unknown as ReturnType<typeof useUser>);
    expect(renderTeacherChromeFlags()).toBe('false-false');
  });
});
