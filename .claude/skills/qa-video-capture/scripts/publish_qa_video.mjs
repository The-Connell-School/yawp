#!/usr/bin/env node

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

const MANIFEST_FILE = "qa-video-manifest.json";
const PASSWORD_STORE = process.env.QA_VIDEO_PASSWORD_STORE || path.join(
  process.env.QA_VIDEO_HOME || path.join(os.homedir(), ".qa-video-capture"),
  "project-passwords.json",
);
const DEFAULT_SITE_NAME = process.env.QA_VIDEO_NETLIFY_SITE_NAME || "";
const DEFAULT_SITE_URL = process.env.QA_VIDEO_SITE_URL || (
  DEFAULT_SITE_NAME ? `https://${DEFAULT_SITE_NAME}.netlify.app` : ""
);
const SITE_LABEL = process.env.QA_VIDEO_SITE_LABEL || "QA Video";

function parseArgs(argv) {
  const args = {
    title: "QA Video",
    filename: "qa-video.mp4",
    fallback: "tmpfiles",
    "preserve-existing": "true",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
    } else {
      args[key] = next;
      i += 1;
    }
  }

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const bootstrap = args.bootstrap === "true";
  if (!bootstrap && !args.video) throw new Error("Missing required --video");
  if (bootstrap && args.video) throw new Error("--bootstrap creates an empty site and cannot be combined with --video");
  return args;
}

function printUsage() {
  console.log(`Usage:
  node publish_qa_video.mjs --bootstrap --site-id SITE_ID
  node publish_qa_video.mjs --video output.mp4 --project yawp --slug pr-144 --title "Yawp PR 144 QA"

Options:
  --project              Project bucket slug. Required for useful QA publishing.
  --slug / --video-id    Video page id under /project/video-id/.
  --project-password     Set or rotate the slug-specific project password.
  --import-site-url      Import an existing QA video manifest while keeping the new canonical URL.
  --build-only           Build files and print URLs without deploying.
  --bootstrap            Deploy an empty root that says "Nothing here."
`);
}

function safeFileName(value) {
  const ext = path.extname(value) || ".mp4";
  const stem = path.basename(value, ext)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "qa-video";
  return `${stem}${ext}`;
}

function safePathSegment(value) {
  return String(value || "qa-video")
    .trim()
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "qa-video";
}

function timestampSegment(value = new Date()) {
  return value.toISOString().replace(/[:.]/g, "-").toLowerCase();
}

function cleanRelativePath(value) {
  const cleaned = String(value || "")
    .split(/[?#]/)[0]
    .replace(/^\.?\//, "")
    .replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("..")) {
    throw new Error(`Unsafe relative path in QA video manifest: ${value}`);
  }
  return cleaned;
}

function urlFor(baseUrl, relativePath) {
  const encoded = cleanRelativePath(relativePath)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${String(baseUrl).replace(/\/$/, "")}/${encoded}`;
}

function prettyPath(pagePath) {
  return `/${cleanRelativePath(pagePath).replace(/\/index\.html$/i, "/")}`;
}

function pageUrlFor(baseUrl, pagePath) {
  return `${String(baseUrl).replace(/\/$/, "")}${prettyPath(pagePath)}`;
}

function projectUrlFor(baseUrl, project) {
  return `${String(baseUrl).replace(/\/$/, "")}/${safePathSegment(project)}/`;
}

function defaultNetlifySiteId() {
  if (process.env.QA_VIDEO_NETLIFY_SITE_ID) return process.env.QA_VIDEO_NETLIFY_SITE_ID;
  if (!DEFAULT_SITE_NAME) return null;
  return findNetlifySiteIdByName(DEFAULT_SITE_NAME);
}

function findNetlifySiteIdByName(name) {
  if (run("netlify", ["--version"]).status !== 0) return null;
  const result = run("netlify", ["sites:list", "--json"]);
  if (result.status !== 0) return null;
  try {
    const sites = JSON.parse(result.stdout);
    const match = sites.find((site) => site.name === name || site.default_domain === `${name}.netlify.app`);
    return match?.id || match?.site_id || null;
  } catch {
    return null;
  }
}

async function makePublishDir(args, videoPath, filename, existingBaseUrl) {
  const root = args.out
    ? path.resolve(args.out)
    : fs.mkdtempSync(path.join(os.tmpdir(), "qa-video-publish-"));
  fs.mkdirSync(root, { recursive: true });

  const existing = await collectExistingCatalogs(args, existingBaseUrl);
  for (const catalog of existing.catalogs) {
    await copyExistingVideos(root, catalog.baseUrl, catalog.videos);
  }

  const passwordStore = loadPasswordStore();
  const videos = [...existing.videos];
  const projects = { ...existing.projects };
  let currentVideo = null;
  let passwordResult = null;
  const passwordResults = [];

  if (args.bootstrap !== "true") {
    const publishedAt = new Date();
    const project = safePathSegment(args.project || args.collection || "misc");
    const projectTitle = args["project-title"] || args.projectTitle || titleCase(project);
    const explicitId = args["video-id"] || args.id || args.slug;
    const baseVideoId = safePathSegment(explicitId || args.title || filename);
    const videoId = explicitId ? baseVideoId : `${baseVideoId}-${timestampSegment(publishedAt)}`;
    const relativeVideoPath = cleanRelativePath(
      path.posix.join("assets", project, videoId, filename),
    );
    const pagePath = cleanRelativePath(path.posix.join(project, videoId, "index.html"));
    const targetVideo = path.join(root, ...relativeVideoPath.split("/"));
    fs.mkdirSync(path.dirname(targetVideo), { recursive: true });
    fs.copyFileSync(videoPath, targetVideo);

    passwordResult = ensureProjectAccess(project, projectTitle, args, projects, passwordStore);
    passwordResults.push(passwordResult);
    currentVideo = {
      id: `${project}/${videoId}`,
      title: args.title || filename,
      project,
      projectTitle,
      slug: baseVideoId,
      videoId,
      publishedAt: publishedAt.toISOString(),
      filename,
      path: relativeVideoPath,
      pagePath,
    };
    videos.push(currentVideo);
  }

  for (const video of videos) {
    if (!projects[video.project]) {
      passwordResults.push(ensureProjectAccess(video.project, video.projectTitle || titleCase(video.project), args, projects, passwordStore));
    }
  }
  for (const [project, projectMeta] of Object.entries(projects)) {
    if (!passwordResults.some((result) => result.project === project)) {
      passwordResults.push(ensureProjectAccess(project, projectMeta.title || titleCase(project), args, projects, passwordStore));
    }
  }

  const normalizedVideos = videos
    .map(normalizeManifestVideo)
    .filter(Boolean)
    .filter(uniqueByVideoId)
    .sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")));

  savePasswordStore(passwordStore);
  writeSite(root, normalizedVideos, projects);
  return { root, currentVideo, videos: normalizedVideos, projects, passwordResult, passwordResults };
}

function uniqueByVideoId(video, index, videos) {
  return videos.findIndex((candidate) => candidate.id === video.id) === index;
}

async function loadExistingCatalog(baseUrl) {
  const manifest = await loadExistingManifest(baseUrl);
  if (manifest) {
    const videos = Array.isArray(manifest.videos)
      ? manifest.videos.map(normalizeManifestVideo).filter(Boolean)
      : [];
    const projects = normalizeProjects(manifest.projects || {});
    return { videos, projects };
  }

  const legacyVideo = await loadLegacyRootVideo(baseUrl);
  return legacyVideo ? { videos: [legacyVideo], projects: {} } : { videos: [], projects: {} };
}

async function collectExistingCatalogs(args, existingBaseUrl) {
  const catalogs = [];
  if (existingBaseUrl && args["preserve-existing"] !== "false") {
    catalogs.push({ baseUrl: existingBaseUrl, ...(await loadExistingCatalog(existingBaseUrl)) });
  }

  const importUrls = String(args["import-site-url"] || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  for (const importUrl of importUrls) {
    catalogs.push({ baseUrl: importUrl, ...(await loadExistingCatalog(importUrl)) });
  }

  const projects = {};
  const videos = [];
  for (const catalog of catalogs) {
    Object.assign(projects, catalog.projects);
    videos.push(...catalog.videos);
  }

  return {
    catalogs,
    projects,
    videos: videos.filter(uniqueByVideoId),
  };
}

async function loadExistingManifest(baseUrl) {
  try {
    const res = await fetch(urlFor(baseUrl, MANIFEST_FILE), { redirect: "follow" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function normalizeProjects(projects) {
  if (Array.isArray(projects)) {
    return Object.fromEntries(projects.map((project) => [safePathSegment(project.project || project.slug), normalizeProject(project)]));
  }

  return Object.fromEntries(
    Object.entries(projects)
      .map(([slug, project]) => [safePathSegment(slug), normalizeProject({ ...project, project: slug })]),
  );
}

function normalizeProject(project) {
  return {
    project: safePathSegment(project.project || project.slug),
    title: String(project.title || project.projectTitle || titleCase(project.project || project.slug || "qa-video")),
    passwordSalt: String(project.passwordSalt || ""),
    passwordHash: String(project.passwordHash || ""),
    updatedAt: String(project.updatedAt || ""),
  };
}

function normalizeManifestVideo(video) {
  try {
    const project = safePathSegment(video.project || "misc");
    const existingPath = cleanRelativePath(video.path);
    const idParts = String(video.id || "").split("/").filter(Boolean);
    const idWithoutProject = idParts[0] === project ? idParts.slice(1).join("-") : idParts.join("-");
    const rawVideoId = video.videoId
      || idWithoutProject
      || video.slug
      || path.basename(existingPath, path.extname(existingPath));
    const videoId = safePathSegment(rawVideoId);
    return {
      id: `${project}/${videoId}`,
      title: String(video.title || path.basename(existingPath)),
      project,
      projectTitle: String(video.projectTitle || titleCase(project)),
      slug: safePathSegment(video.slug || videoId),
      videoId,
      publishedAt: String(video.publishedAt || ""),
      filename: safeFileName(video.filename || path.basename(existingPath)),
      path: existingPath,
      pagePath: cleanRelativePath(path.posix.join(project, videoId, "index.html")),
    };
  } catch {
    return null;
  }
}

async function loadLegacyRootVideo(baseUrl) {
  try {
    const res = await fetch(String(baseUrl).replace(/\/$/, "/"), { redirect: "follow" });
    if (!res.ok) return null;
    const body = await res.text();
    const videoMatch =
      body.match(/<video\b[^>]*\bsrc=["']([^"']+\.mp4(?:\?[^"']*)?)["']/i) ||
      body.match(/href=["']([^"']+\.mp4(?:\?[^"']*)?)["']/i);
    if (!videoMatch) return null;
    const videoPath = cleanRelativePath(decodeURI(videoMatch[1]));
    const titleMatch = body.match(/<h1[^>]*>(.*?)<\/h1>/is) || body.match(/<title[^>]*>(.*?)<\/title>/is);
    const title = stripHtml(titleMatch?.[1] || path.basename(videoPath));
    const videoId = safePathSegment(path.basename(videoPath, path.extname(videoPath)));
    return {
      id: `legacy/${videoId}`,
      title,
      project: "legacy",
      projectTitle: "Legacy",
      slug: videoId,
      videoId,
      publishedAt: "",
      filename: safeFileName(path.basename(videoPath)),
      path: videoPath,
      pagePath: cleanRelativePath(path.posix.join("legacy", videoId, "index.html")),
    };
  } catch {
    return null;
  }
}

async function copyExistingVideos(root, baseUrl, videos) {
  for (const video of videos) {
    const relativePath = cleanRelativePath(video.path);
    const target = path.join(root, ...relativePath.split("/"));
    if (fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    await downloadFile(urlFor(baseUrl, relativePath), target);
  }
}

async function downloadFile(url, target) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to preserve existing QA video: ${res.status} ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length <= 0) throw new Error(`Existing QA video was empty: ${url}`);
  fs.writeFileSync(target, buffer);
}

function loadPasswordStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PASSWORD_STORE, "utf8"));
    return {
      version: 1,
      projects: parsed.projects && typeof parsed.projects === "object" ? parsed.projects : {},
    };
  } catch {
    return { version: 1, projects: {} };
  }
}

function savePasswordStore(store) {
  fs.mkdirSync(path.dirname(PASSWORD_STORE), { recursive: true });
  fs.writeFileSync(PASSWORD_STORE, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(PASSWORD_STORE, 0o600);
  } catch {
    // Best effort local credential protection.
  }
}

function ensureProjectAccess(project, title, args, projects, passwordStore) {
  const existing = projects[project];
  const explicitPassword = args["project-password"] || envProjectPassword(project);
  const localPassword = passwordStore.projects[project];
  const shouldRotate = args["rotate-password"] === "true" || Boolean(explicitPassword);

  if (existing?.passwordSalt && existing?.passwordHash && !shouldRotate) {
    return {
      project,
      password: localPassword && hashPassword(localPassword, existing.passwordSalt) === existing.passwordHash
        ? localPassword
        : null,
      generated: false,
      source: localPassword ? "local-store" : "existing-manifest",
    };
  }

  const password = explicitPassword || localPassword || generatePassword();
  const salt = existing?.passwordSalt && !shouldRotate
    ? existing.passwordSalt
    : crypto.randomBytes(16).toString("hex");
  projects[project] = {
    project,
    title: title || existing?.title || titleCase(project),
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
    updatedAt: new Date().toISOString(),
  };
  passwordStore.projects[project] = password;
  return {
    project,
    password,
    generated: !explicitPassword && !localPassword,
    source: explicitPassword ? "provided" : (localPassword ? "local-store" : "generated"),
  };
}

function envProjectPassword(project) {
  const key = `QA_VIDEO_PROJECT_PASSWORD_${project.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()}`;
  return process.env[key] || process.env.QA_VIDEO_PROJECT_PASSWORD || null;
}

function generatePassword() {
  return crypto.randomBytes(9).toString("base64url");
}

function hashPassword(password, salt) {
  return crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function writeSite(root, videos, projects) {
  const projectVideos = groupVideosByProject(videos);
  fs.writeFileSync(path.join(root, "index.html"), rootHtml());
  fs.writeFileSync(path.join(root, "404.html"), rootHtml());

  for (const [project, bucketVideos] of Object.entries(projectVideos)) {
    const projectMeta = projects[project] || {
      project,
      title: titleCase(project),
      passwordSalt: "",
      passwordHash: "",
    };
    const projectFile = path.join(root, project, "index.html");
    fs.mkdirSync(path.dirname(projectFile), { recursive: true });
    fs.writeFileSync(projectFile, projectHtml(projectMeta, bucketVideos));

    for (const video of bucketVideos) {
      const pageFile = path.join(root, ...cleanRelativePath(video.pagePath).split("/"));
      fs.mkdirSync(path.dirname(pageFile), { recursive: true });
      fs.writeFileSync(pageFile, videoHtml(projectMeta, video));
    }
  }

  fs.writeFileSync(
    path.join(root, MANIFEST_FILE),
    `${JSON.stringify({ version: 3, updatedAt: new Date().toISOString(), projects, videos }, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(root, "_headers"), headersFor(videos));
}

function groupVideosByProject(videos) {
  return videos.reduce((groups, video) => {
    groups[video.project] ||= [];
    groups[video.project].push(video);
    return groups;
  }, {});
}

function rootHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nothing here.</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; background: #0b0f14; color: #e5e7eb; }
    main { padding: 24px; text-align: center; }
    h1 { margin: 0; font-size: clamp(28px, 5vw, 48px); font-weight: 650; letter-spacing: 0; }
  </style>
</head>
<body>
  <main><h1>Nothing here.</h1></main>
</body>
</html>
`;
}

function projectHtml(project, videos) {
  const title = escapeHtml(project.title || titleCase(project.project));
  const publicVideos = videos.map((video) => ({
    title: video.title,
    publishedAt: video.publishedAt,
    href: prettyPath(video.pagePath),
    videoId: video.videoId,
  }));
  return appShell({
    title,
    project,
    body: `<section class="gate" data-gate>
      <p class="eyebrow">${escapeHtml(SITE_LABEL)}</p>
      <h1>${title}</h1>
      <form data-auth-form>
        <label for="password">Project password</label>
        <div class="password-row">
          <input id="password" name="password" type="password" autocomplete="current-password" autofocus>
          <button type="submit">Unlock</button>
        </div>
        <p class="error" data-error hidden>Incorrect password.</p>
      </form>
    </section>
    <section class="content" data-content hidden>
      <header class="bucket-header">
        <p class="eyebrow">${escapeHtml(SITE_LABEL)}</p>
        <h1>${title}</h1>
        <p>${videos.length} video${videos.length === 1 ? "" : "s"}</p>
      </header>
      <div class="video-list" data-video-list></div>
    </section>`,
    script: `const videos = ${scriptJson(publicVideos)};
const list = document.querySelector("[data-video-list]");
list.innerHTML = videos.length ? videos.map((video) => {
  const date = video.publishedAt ? new Date(video.publishedAt).toLocaleString() : "";
  return \`<article class="video-card"><a href="\${video.href}">\${escapeHtml(video.title)}</a><p>\${escapeHtml(date)}</p><code>\${escapeHtml(video.videoId)}</code></article>\`;
}).join("") : "<p>No videos have been published for this project yet.</p>";`,
  });
}

function videoHtml(project, video) {
  const title = escapeHtml(video.title);
  const videoSrc = `/${cleanRelativePath(video.path).split("/").map(encodeURIComponent).join("/")}`;
  return appShell({
    title: video.title,
    project,
    body: `<section class="gate" data-gate>
      <p class="eyebrow">${escapeHtml(SITE_LABEL)}</p>
      <h1>${title}</h1>
      <form data-auth-form>
        <label for="password">Project password</label>
        <div class="password-row">
          <input id="password" name="password" type="password" autocomplete="current-password" autofocus>
          <button type="submit">Unlock</button>
        </div>
        <p class="error" data-error hidden>Incorrect password.</p>
      </form>
    </section>
    <section class="content" data-content hidden>
      <nav><a href="/${safePathSegment(project.project)}/">Back to ${escapeHtml(project.title || titleCase(project.project))}</a></nav>
      <h1>${title}</h1>
      <video controls playsinline preload="metadata" src="${videoSrc}"></video>
      <p class="meta">${escapeHtml(video.publishedAt ? new Date(video.publishedAt).toLocaleString() : "")}</p>
    </section>`,
  });
}

function appShell({ title, project, body, script = "" }) {
  const projectPayload = {
    project: safePathSegment(project.project),
    title: project.title || titleCase(project.project),
    passwordSalt: project.passwordSalt,
    passwordHash: project.passwordHash,
  };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; }
    [hidden] { display: none !important; }
    body { margin: 0; min-height: 100vh; font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; background: #0b0f14; color: #e5e7eb; }
    main { max-width: 980px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0 0 16px; font-size: clamp(28px, 5vw, 44px); font-weight: 680; letter-spacing: 0; }
    p { color: #aab4c3; line-height: 1.5; }
    a { color: #77d9c6; text-decoration-thickness: 1px; text-underline-offset: 3px; }
    video { width: 100%; height: auto; background: #000; border: 1px solid #22303d; border-radius: 8px; }
    label { display: block; margin-bottom: 8px; color: #cbd5e1; }
    input { min-width: 0; flex: 1; border: 1px solid #344456; border-radius: 6px; background: #111923; color: white; padding: 12px; font-size: 16px; }
    button { border: 0; border-radius: 6px; background: #77d9c6; color: #071014; padding: 12px 16px; font-weight: 700; cursor: pointer; }
    nav { margin-bottom: 18px; }
    code { color: #94a3b8; }
    .eyebrow { margin: 0 0 8px; color: #77d9c6; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
    .gate { min-height: calc(100vh - 48px); display: grid; align-content: center; gap: 12px; }
    .password-row { display: flex; gap: 10px; max-width: 520px; }
    .error { color: #fca5a5; }
    .bucket-header { padding: 24px 0; border-bottom: 1px solid #22303d; }
    .video-list { display: grid; gap: 12px; padding: 20px 0; }
    .video-card { border: 1px solid #22303d; border-radius: 8px; padding: 16px; background: #111923; }
    .video-card a { display: inline-block; font-size: 19px; font-weight: 700; }
    .video-card p { margin: 8px 0; }
    .meta { margin-top: 12px; }
    @media (max-width: 560px) { .password-row { flex-direction: column; } button { width: 100%; } }
  </style>
</head>
<body>
  <main>
    ${body}
  </main>
  <script>
const project = ${scriptJson(projectPayload)};
const authKey = \`qa-video-capture:\${project.project}:auth\`;
const gate = document.querySelector("[data-gate]");
const content = document.querySelector("[data-content]");
const form = document.querySelector("[data-auth-form]");
const error = document.querySelector("[data-error]");
const queryPassword = new URLSearchParams(window.location.search).get("password");

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function unlock() {
  localStorage.setItem(authKey, project.passwordHash);
  if (gate) gate.hidden = true;
  if (content) content.hidden = false;
}

function removePasswordQueryParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("password")) return;
  url.searchParams.delete("password");
  const nextUrl = \`\${url.pathname}\${url.search}\${url.hash}\`;
  window.history.replaceState(null, "", nextUrl || url.pathname);
}

async function authenticatePassword(password, options = {}) {
  const hash = await sha256(\`\${project.passwordSalt}:\${password || ""}\`);
  if (hash === project.passwordHash) {
    unlock();
    return true;
  }
  if (options.showError !== false && error) {
    error.hidden = false;
  }
  return false;
}

if (localStorage.getItem(authKey) === project.passwordHash) {
  unlock();
  if (queryPassword) removePasswordQueryParam();
} else if (queryPassword) {
  authenticatePassword(queryPassword).finally(removePasswordQueryParam);
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = new FormData(form).get("password") || "";
    await authenticatePassword(password);
  });
}

${script}
  </script>
</body>
</html>
`;
}

function headersFor(videos) {
  return videos
    .flatMap((video) => [
      `/${cleanRelativePath(video.path)}`,
      "  Content-Type: video/mp4",
      "  Content-Disposition: inline",
      "",
    ])
    .join("\n");
}

function projectPasswordMap(passwordResults = []) {
  return Object.fromEntries(
    passwordResults
      .filter((result) => result?.project && result.password)
      .map((result) => [result.project, {
        password: result.password,
        generated: result.generated,
        source: result.source,
      }]),
  );
}

function stripHtml(value) {
  return String(value).replace(/<[^>]+>/g, "").trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function titleCase(value) {
  return String(value || "QA Video")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "QA Video";
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
}

async function verifyUrl(url, method = "HEAD") {
  const res = await fetch(url, { method, redirect: "follow" });
  if (!res.ok) throw new Error(`URL verification failed: ${res.status} ${url}`);
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    contentLength: res.headers.get("content-length"),
  };
}

async function publishNetlify(args, videoPath) {
  const siteId = args["site-id"] || defaultNetlifySiteId();
  if (!siteId) throw new Error("No Netlify site id. Set QA_VIDEO_NETLIFY_SITE_ID, pass --site-id, or set QA_VIDEO_NETLIFY_SITE_NAME.");
  if (!(args["site-url"] || DEFAULT_SITE_URL)) {
    throw new Error("No canonical site URL. Set QA_VIDEO_SITE_URL or pass --site-url.");
  }
  if (run("netlify", ["--version"]).status !== 0) throw new Error("Netlify CLI is not installed or not on PATH.");

  const filename = videoPath ? safeFileName(args.filename || path.basename(videoPath)) : null;
  const existingBaseUrl = args["site-url"] || DEFAULT_SITE_URL;
  const publish = await makePublishDir(args, videoPath, filename, existingBaseUrl);
  const deployArgs = ["deploy", "--dir", publish.root, "--site", siteId, "--json"];
  if (args.draft !== "true") deployArgs.splice(1, 0, "--prod");
  const deploy = run("netlify", deployArgs);
  if (deploy.status !== 0) {
    throw new Error(`Netlify deploy failed:\n${deploy.stderr || deploy.stdout}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(deploy.stdout);
  } catch (err) {
    throw new Error(`Netlify deploy returned non-JSON output:\n${deploy.stdout}\n${err.message}`);
  }

  const directoryUrl = parsed.url || parsed.ssl_url || parsed.deploy_url;
  if (!directoryUrl) throw new Error(`Netlify deploy JSON did not include a URL: ${deploy.stdout}`);
  const canonicalBaseUrl = args["site-url"] || DEFAULT_SITE_URL;
  const current = publish.currentVideo;
  const pageUrl = current ? pageUrlFor(canonicalBaseUrl, current.pagePath) : canonicalBaseUrl;
  const projectUrl = current ? projectUrlFor(canonicalBaseUrl, current.project) : null;
  const videoUrl = current ? urlFor(canonicalBaseUrl, current.path) : null;
  const verification = current
    ? await verifyUrl(videoUrl)
    : await verifyUrl(canonicalBaseUrl, "GET");
  return {
    provider: "netlify",
    temporary: false,
    pageUrl,
    projectUrl,
    directoryUrl: canonicalBaseUrl,
    deployUrl: directoryUrl,
    permalink: parsed.deploy_url || null,
    permalinkPageUrl: current && parsed.deploy_url ? pageUrlFor(parsed.deploy_url, current.pagePath) : null,
    permalinkVideoUrl: current && parsed.deploy_url ? urlFor(parsed.deploy_url, current.path) : null,
    videoUrl,
    publishDir: publish.root,
    publishedVideo: current,
    projectPassword: publish.passwordResult?.password || null,
    projectPasswordGenerated: publish.passwordResult?.generated || false,
    projectPasswordSource: publish.passwordResult?.source || null,
    projectPasswords: projectPasswordMap(publish.passwordResults),
    videoCount: publish.videos.length,
    projectCount: Object.keys(publish.projects).length,
    verification,
    raw: parsed,
  };
}

async function publishTmpfiles(videoPath) {
  const upload = run("curl", [
    "-fsS",
    "-F",
    `file=@${videoPath};type=video/mp4;filename=${safeFileName(path.basename(videoPath))}`,
    "https://tmpfiles.org/api/v1/upload",
  ]);
  if (upload.status !== 0) {
    throw new Error(`tmpfiles upload failed:\n${upload.stderr || upload.stdout}`);
  }
  const parsed = JSON.parse(upload.stdout);
  const pageUrl = parsed?.data?.url;
  if (!pageUrl) throw new Error(`tmpfiles response did not include a URL: ${upload.stdout}`);
  const videoUrl = pageUrl.replace("https://tmpfiles.org/", "https://tmpfiles.org/dl/");
  const verification = await verifyUrl(videoUrl);
  return {
    provider: "tmpfiles",
    temporary: true,
    pageUrl,
    videoUrl,
    verification,
    raw: parsed,
  };
}

function buildOnlyResult(args, publish) {
  const current = publish.currentVideo;
  return {
    provider: "build-only",
    temporary: false,
    pageUrl: current ? prettyPath(current.pagePath) : "/",
    projectUrl: current ? `/${current.project}/` : null,
    videoUrl: current ? `/${cleanRelativePath(current.path)}` : null,
    publishDir: publish.root,
    publishedVideo: current,
    projectPassword: publish.passwordResult?.password || null,
    projectPasswordGenerated: publish.passwordResult?.generated || false,
    projectPasswordSource: publish.passwordResult?.source || null,
    projectPasswords: projectPasswordMap(publish.passwordResults),
    videoCount: publish.videos.length,
    projectCount: Object.keys(publish.projects).length,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const videoPath = args.video ? path.resolve(args.video) : null;
  if (videoPath) {
    if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);
    if (fs.statSync(videoPath).size <= 0) throw new Error(`Video is empty: ${videoPath}`);
  }

  const filename = videoPath ? safeFileName(args.filename || path.basename(videoPath)) : null;
  const existingBaseUrl = args["site-url"] || DEFAULT_SITE_URL;

  if (args["build-only"] === "true") {
    const publish = await makePublishDir(args, videoPath, filename, existingBaseUrl);
    console.log(JSON.stringify(buildOnlyResult(args, publish), null, 2));
    return;
  }

  let result;
  const errors = [];
  try {
    result = await publishNetlify(args, videoPath);
  } catch (err) {
    errors.push(`netlify: ${err.message}`);
    if (!videoPath || args.fallback !== "tmpfiles") throw err;
    result = await publishTmpfiles(videoPath);
  }

  if (videoPath) {
    const manifestPath = path.join(path.dirname(videoPath), "public-url.json");
    fs.writeFileSync(manifestPath, `${JSON.stringify({ ...result, sourceVideo: videoPath, errors }, null, 2)}\n`);
    console.log(JSON.stringify({ ...result, sourceVideo: videoPath, manifestPath, errors }, null, 2));
  } else {
    console.log(JSON.stringify({ ...result, errors }, null, 2));
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
