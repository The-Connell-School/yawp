export function renderDevPanel({ publicBasePath = '' } = {}) {
  const base = publicBasePath.replace(/\/$/, '');
  const api = (path) => `${base}${path}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Blackboard LTI mock</title>
  <style>
    :root { color-scheme: light; --ink: #111827; --muted: #6b7280; --line: #e5e7eb; --bg: #f8fafc; --card: #fff; --accent: #0369a1; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: var(--bg); color: var(--ink); }
    header { background: #0f172a; color: #fff; padding: 1rem 1.5rem; }
    header p { margin: 0.35rem 0 0; color: #cbd5e1; font-size: 0.9rem; }
    main { display: grid; gap: 1rem; padding: 1rem 1.5rem 2rem; }
    section { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 1rem; }
    h1, h2 { margin: 0 0 0.75rem; font-size: 1.1rem; }
    h1 { font-size: 1.25rem; margin: 0; }
    .row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    button { border: 1px solid var(--line); background: #fff; border-radius: 8px; padding: 0.45rem 0.7rem; cursor: pointer; }
    button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    button.danger { background: #991b1b; color: #fff; border-color: #991b1b; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; border-bottom: 1px solid var(--line); padding: 0.4rem 0.3rem; vertical-align: top; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; font-size: 0.75rem; }
    .muted { color: var(--muted); font-size: 0.85rem; }
    label { display: grid; gap: 0.2rem; font-size: 0.8rem; color: var(--muted); }
    input, select { padding: 0.35rem 0.5rem; border: 1px solid var(--line); border-radius: 6px; font: inherit; color: var(--ink); }
  </style>
</head>
<body>
  <header>
    <h1>Blackboard LTI 1.3 platform mock</h1>
    <p>YAWP is the Tool. This process impersonates Learn. Keys were minted at boot and never leave this environment.</p>
  </header>
  <main>
    <section>
      <h2>Launch</h2>
      <div class="row">
        <label>User sub <input id="sub" placeholder="bb-user-student" /></label>
        <label>Context id <input id="contextId" value="_4_1" /></label>
        <label>Context label <input id="contextLabel" value="ENG-101" /></label>
        <label>Context title <input id="contextTitle" value="English Composition" /></label>
        <label>Resource link id <input id="resourceLinkId" value="_99_1" /></label>
        <label>Resource link title <input id="resourceLinkTitle" value="Yawp Assignment" /></label>
      </div>
      <p class="muted">Buttons start an OIDC third-party login toward the configured Tool login URL.</p>
      <div class="row">
        <button class="primary" data-launch="Learner">Student launch</button>
        <button class="primary" data-launch="Instructor">Instructor launch</button>
        <button class="primary" data-launch="Administrator">Administrator launch</button>
        <button data-launch="Instructor" data-message-type="LtiDeepLinkingRequest">Deep Linking launch</button>
      </div>
    </section>
    <section>
      <h2>Faults</h2>
      <p class="muted">Each button is an explicit error path from the integration spec. Launches POST a bad id_token; AGS/token faults fire against the mock endpoints.</p>
      <div class="row">
        <button class="danger" data-fault="expired_launch">Expired launch</button>
        <button class="danger" data-fault="replayed_nonce">Replayed nonce</button>
        <button class="danger" data-fault="invalid_jwt">Invalid JWT</button>
        <button class="danger" data-fault="mis_signed_jwt">Mis-signed JWT</button>
        <button class="danger" data-fault="unknown_deployment">Unknown deployment</button>
        <button class="danger" data-fault="wrong_audience">Wrong audience</button>
        <button class="danger" data-fault="token_endpoint_failure">Token endpoint failure</button>
        <button class="danger" data-fault="ags_403_missing_scope">AGS 403 missing scope</button>
        <button class="danger" data-fault="ags_5xx">AGS 5xx</button>
        <button class="danger" data-fault="ags_timeout">AGS timeout</button>
      </div>
    </section>
    <section>
      <h2>Grades Blackboard received</h2>
      <div class="row">
        <button type="button" id="refresh">Refresh</button>
        <button type="button" id="rotate">Rotate keys</button>
        <button type="button" id="clear">Clear log</button>
      </div>
      <table>
        <thead><tr><th>When</th><th>User</th><th>Line item</th><th>Score</th><th>Timestamp</th></tr></thead>
        <tbody id="scores"></tbody>
      </table>
      <p class="muted" id="current-scores"></p>
    </section>
    <section>
      <h2>Event log</h2>
      <table>
        <thead><tr><th>When</th><th>Method</th><th>Path</th><th>Status</th><th>Detail</th></tr></thead>
        <tbody id="events"></tbody>
      </table>
    </section>
  </main>
  <script>
    const api = (path) => ${JSON.stringify(api(''))} + path;
    async function readJson(path) {
      const response = await fetch(api(path));
      return response.json();
    }
    function qs(extra) {
      const params = new URLSearchParams(extra);
      for (const id of ['sub','contextId','contextLabel','contextTitle','resourceLinkId','resourceLinkTitle']) {
        const value = document.getElementById(id).value.trim();
        if (value) params.set(id === 'sub' ? 'sub' : id.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()), value);
      }
      return params;
    }
    async function refresh() {
      const [events, scores] = await Promise.all([readJson('/dev/events'), readJson('/dev/scores')]);
      document.getElementById('events').innerHTML = events.slice().reverse().map((event) =>
        '<tr><td>' + event.at + '</td><td>' + event.method + '</td><td>' + event.path + '</td><td>' + event.status + '</td><td><pre>' +
        JSON.stringify(event.detail || {}, null, 2) + '</pre></td></tr>'
      ).join('');
      document.getElementById('scores').innerHTML = (scores.received || []).slice().reverse().map((score) =>
        '<tr><td>' + score.receivedAt + '</td><td>' + score.userId + '</td><td>' + score.lineItemId + '</td><td>' +
        (score.scoreGiven ?? '') + '/' + (score.scoreMaximum ?? '') + '</td><td>' + score.timestamp + '</td></tr>'
      ).join('');
      document.getElementById('current-scores').textContent = 'Current results: ' + JSON.stringify(scores.current || []);
    }
    document.querySelectorAll('[data-launch]').forEach((button) => {
      button.addEventListener('click', () => {
        const params = qs({
          role: button.getAttribute('data-launch'),
          format: 'redirect'
        });
        if (button.getAttribute('data-message-type')) {
          params.set('message_type', button.getAttribute('data-message-type'));
        }
        window.location.href = api('/dev/launch?' + params.toString());
      });
    });
    document.querySelectorAll('[data-fault]').forEach((button) => {
      button.addEventListener('click', async () => {
        const fault = button.getAttribute('data-fault');
        if (fault.startsWith('ags_') || fault === 'token_endpoint_failure') {
          await fetch(api('/dev/fire-fault?fault=' + encodeURIComponent(fault)), { method: 'POST' });
          await refresh();
          return;
        }
        const params = qs({ role: 'Learner', fault, format: 'redirect' });
        window.location.href = api('/dev/launch?' + params.toString());
      });
    });
    document.getElementById('refresh').addEventListener('click', refresh);
    document.getElementById('rotate').addEventListener('click', async () => {
      await fetch(api('/dev/rotate-keys'), { method: 'POST' });
      await refresh();
    });
    document.getElementById('clear').addEventListener('click', async () => {
      await fetch(api('/dev/events'), { method: 'DELETE' });
      await refresh();
    });
    refresh();
    setInterval(refresh, 4000);
  </script>
</body>
</html>`;
}
