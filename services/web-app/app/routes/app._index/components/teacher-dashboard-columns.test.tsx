import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeacherDashboardColumns } from './teacher-dashboard-columns';

describe('TeacherDashboardColumns', () => {
  test('waiting for approval puts the banner under the heading, not in a side column', () => {
    const html = renderToStaticMarkup(
      <TeacherDashboardColumns
        welcome={<h1 className="locked-home-welcome">Welcome, Brian!</h1>}
        pendingBanner={
          <section data-testid="locked-dashboard-pending-card">
            Awaiting approval from Dr. Patel
          </section>
        }
      >
        <div data-testid="teacher-classes-grid">
          <h2>My Classes</h2>
          <div data-tour="dashboard-classes">Class card</div>
          <div data-testid="locked-dashboard-getting-started">
            Getting started
          </div>
        </div>
      </TeacherDashboardColumns>
    );

    expect(html).not.toContain('locked-home-b2--with-rail');
    expect(html).not.toContain('locked-home-rail-desktop');
    expect(html).not.toContain('locked-home-rail-mobile');
    const welcome = html.indexOf('locked-home-welcome');
    const banner = html.indexOf('locked-dashboard-pending-card');
    const classes = html.indexOf('teacher-classes-grid');
    expect(welcome).toBeGreaterThan(-1);
    expect(banner).toBeGreaterThan(welcome);
    expect(classes).toBeGreaterThan(banner);
    expect(html).toContain('locked-home-pending-banner');
    expect(html).toContain('data-tour="dashboard-classes"');
    expect(html).toContain('locked-dashboard-getting-started');
  });

  test('an approved advocate rail is the only side column', () => {
    const html = renderToStaticMarkup(
      <TeacherDashboardColumns
        welcome={<h1 className="locked-home-welcome">Welcome, Brian!</h1>}
        advocateRail={<div data-testid="free-account-rail">Advocate</div>}
      >
        <div data-testid="teacher-classes-grid">Classes</div>
      </TeacherDashboardColumns>
    );

    expect(html).toContain('locked-home-b2--with-rail');
    expect(html).toContain('locked-home-rail-desktop');
    expect(html).not.toContain('locked-home-pending-banner');
  });
});
