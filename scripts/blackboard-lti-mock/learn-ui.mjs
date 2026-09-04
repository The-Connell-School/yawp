import { COURSE, PERSONAS, personaForRole } from './catalog.mjs';
import { appPath } from './session.mjs';

export function renderSignIn({ publicBasePath = '' } = {}) {
  const base = publicBasePath;
  const action = appPath(base, '/learn/session');
  return layout({
    publicBasePath: base,
    title: 'Sign in',
    session: null,
    body: `
      <div class="auth">
        <p class="eyebrow">Blackboard Learn</p>
        <h1>Sign in</h1>
        <p class="lede">Open a course the way a student or teacher would.</p>
        <div class="personas">
          ${personaCard(PERSONAS.student, action)}
          ${personaCard(PERSONAS.teacher, action)}
        </div>
      </div>`,
  });
}

export function renderCourses({ publicBasePath = '', session, course = COURSE }) {
  const href = appPath(publicBasePath, `/learn/courses/${course.id}/content`);
  return layout({
    publicBasePath,
    title: 'Courses',
    session,
    body: `
      <h1>Courses</h1>
      <a class="course-card" href="${escapeHtml(href)}">
        <span class="code">${escapeHtml(course.label)}</span>
        <strong>${escapeHtml(course.title)}</strong>
        <span class="muted">${escapeHtml(course.term)}</span>
      </a>`,
  });
}

export function renderContent({
  publicBasePath = '',
  session,
  course = COURSE,
  items = [],
}) {
  const isTeacher = session.role === 'Instructor';
  const addHref = appPath(publicBasePath, `/learn/courses/${course.id}/tools/lti`);
  const rows = items
    .map((item) => {
      const href = appPath(
        publicBasePath,
        `/learn/courses/${course.id}/content/${encodeURIComponent(item.id)}`
      );
      return `<a class="item" data-content-launch="${escapeHtml(item.id)}" href="${escapeHtml(href)}">
        <span class="kind">LTI</span>
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          <span class="muted">${escapeHtml(item.description || 'Learning tool')}</span>
        </span>
      </a>`;
    })
    .join('');
  return layout({
    publicBasePath,
    title: `${course.label} Content`,
    session,
    course,
    body: `
      ${courseHeader(course)}
      ${courseNav(publicBasePath, course, session, 'content')}
      <section class="panel">
        <div class="panel-head">
          <h2>Content</h2>
          ${
            isTeacher
              ? `<a class="text-link" data-deep-link href="${escapeHtml(addHref)}">Add teaching tool</a>`
              : ''
          }
        </div>
        <div class="list">${rows || '<p class="muted">No content yet.</p>'}</div>
      </section>`,
  });
}

export function renderGrades({
  publicBasePath = '',
  session,
  course = COURSE,
  items = [],
  roster = [],
  scores = [],
}) {
  const isTeacher = session.role === 'Instructor';
  const columns = items.filter((item) => item.type === 'ltiResourceLink' || item.lineItemId);
  const people = isTeacher
    ? roster
    : roster.filter((person) => person.sub === personaForRole(session.role).user.sub);
  const scoreMap = new Map(
    scores.map((score) => [`${score.lineItemId}::${score.userId}`, score])
  );
  const head = columns
    .map((item) => `<th>${escapeHtml(item.title)}</th>`)
    .join('');
  const body = people
    .map((person) => {
      const cells = columns
        .map((item) => {
          const score = scoreMap.get(`${item.lineItemId}::${person.sub}`);
          if (!score || score.scoreGiven == null) return '<td>—</td>';
          const max = score.scoreMaximum != null ? ` / ${score.scoreMaximum}` : '';
          return `<td>${escapeHtml(String(score.scoreGiven))}${max}</td>`;
        })
        .join('');
      return `<tr><th scope="row">${escapeHtml(person.name)}</th>${cells}</tr>`;
    })
    .join('');
  return layout({
    publicBasePath,
    title: isTeacher ? `${course.label} Gradebook` : `${course.label} My Grades`,
    session,
    course,
    body: `
      ${courseHeader(course)}
      ${courseNav(publicBasePath, course, session, 'grades')}
      <section class="panel">
        <h2>${isTeacher ? 'Gradebook' : 'My Grades'}</h2>
        <table class="grades">
          <thead><tr><th>Student</th>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </section>`,
  });
}

function personaCard(persona, action) {
  return `
    <form method="post" action="${escapeHtml(action)}">
      <input type="hidden" name="persona" value="${escapeHtml(persona.id)}" />
      <button type="submit" data-persona="${escapeHtml(persona.id)}">
        <span class="role">${escapeHtml(persona.label)}</span>
        <strong>${escapeHtml(persona.user.name)}</strong>
        <span class="muted">${escapeHtml(persona.user.email)}</span>
      </button>
    </form>`;
}

function courseHeader(course) {
  return `<header class="course-head">
    <p class="eyebrow">${escapeHtml(course.label)}</p>
    <h1>${escapeHtml(course.title)}</h1>
  </header>`;
}

function courseNav(publicBasePath, course, session, active) {
  const isTeacher = session.role === 'Instructor';
  const content = appPath(publicBasePath, `/learn/courses/${course.id}/content`);
  const grades = appPath(publicBasePath, `/learn/courses/${course.id}/grades`);
  const gradeLabel = isTeacher ? 'Gradebook' : 'My Grades';
  return `<nav class="tabs">
    <a class="${active === 'content' ? 'active' : ''}" href="${escapeHtml(content)}">Content</a>
    <a class="${active === 'grades' ? 'active' : ''}" href="${escapeHtml(grades)}">${gradeLabel}</a>
  </nav>`;
}

function layout({ publicBasePath, title, session, body }) {
  const home = appPath(publicBasePath, session ? '/learn/courses' : '/learn/signin');
  const signOut = appPath(publicBasePath, '/learn/logout');
  const persona = session ? personaForRole(session.role) : null;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · Blackboard Learn</title>
  <style>
    :root { color-scheme: light; --ink:#1c1c1c; --muted:#5c5c5c; --line:#e3e1dc; --bg:#f4f3ef; --card:#fff; --accent:#6c3b9b; --accent-ink:#fff; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", ui-sans-serif, system-ui, sans-serif; background: var(--bg); color: var(--ink); }
    .top { display:flex; justify-content:space-between; align-items:center; gap:1rem; background:#2d2d2d; color:#fff; padding:.75rem 1.25rem; }
    .brand { color:#fff; text-decoration:none; font-weight:700; letter-spacing:.02em; }
    .who { display:flex; gap:1rem; align-items:center; font-size:.9rem; }
    .who a { color:#ddd; }
    main { max-width: 920px; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; display:grid; gap:1rem; }
    h1 { margin: 0 0 .35rem; font-size: 1.7rem; }
    h2 { margin: 0; font-size: 1.05rem; }
    .eyebrow { margin: 0; text-transform: uppercase; letter-spacing: .08em; font-size: .72rem; color: var(--muted); }
    .lede, .muted { color: var(--muted); }
    .auth { max-width: 34rem; }
    .personas { display:grid; gap:.75rem; margin-top:1rem; }
    .personas button, .course-card, .item { display:grid; gap:.15rem; width:100%; text-align:left; background:var(--card); border:1px solid var(--line); border-radius:10px; padding:1rem 1.1rem; text-decoration:none; color:inherit; cursor:pointer; font: inherit; }
    .personas button:hover, .course-card:hover, .item:hover { border-color: var(--accent); }
    .role { font-size:.75rem; text-transform:uppercase; letter-spacing:.06em; color: var(--accent); font-weight:700; }
    .course-head { margin-bottom:.25rem; }
    .tabs { display:flex; gap:.5rem; border-bottom:1px solid var(--line); }
    .tabs a { color: var(--muted); text-decoration:none; padding:.5rem .2rem .7rem; }
    .tabs a.active { color: var(--ink); font-weight:700; box-shadow: inset 0 -2px 0 var(--accent); }
    .panel { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:1rem; display:grid; gap:.75rem; }
    .panel-head { display:flex; justify-content:space-between; align-items:baseline; gap:1rem; }
    .text-link { color: var(--accent); text-decoration:none; font-weight:600; }
    .list { display:grid; gap:.6rem; }
    .item { grid-template-columns: auto 1fr; align-items:center; gap:.8rem; }
    .kind { background:#efe7f7; color:var(--accent); font-size:.7rem; font-weight:700; padding:.25rem .4rem; border-radius:4px; }
    table.grades { width:100%; border-collapse:collapse; }
    table.grades th, table.grades td { text-align:left; padding:.55rem .4rem; border-bottom:1px solid var(--line); }
  </style>
</head>
<body>
  <div class="top">
    <a class="brand" href="${escapeHtml(home)}">Blackboard Learn</a>
    <div class="who">
      ${persona ? `<span>${escapeHtml(persona.user.name)}</span><a href="${escapeHtml(signOut)}">Sign out</a>` : ''}
    </div>
  </div>
  <main>${body}</main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
