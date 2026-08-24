#!/usr/bin/env node

/**
 * Storyboard-driven marketing capture for YAWP!.
 *
 * Builds on the qa-video-capture skill: this runner produces the raw video,
 * screenshots, narration cues, and cue markers. Narration synthesis, muxing,
 * and publishing stay in qa-video-capture's scripts.
 *
 * Modes:
 *   --emit-cues <file>   Write a narrate_qa_video.mjs cue file and exit.
 *   --audit              Visit each scene route, check its waitFor selector,
 *                        screenshot, and report. No interactions, no cues.
 *   (default)            Run the full storyboard and record video.
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, "..");
const DEFAULT_BASE_URL = process.env.YAWP_MARKETING_BASE_URL || "http://localhost:3000";
const DEFAULT_LOGIN_PATH = "/auth/dev-login";
const DEFAULT_PERSONA_DOMAIN = "yawp.local";
const CUE_GAP_SECONDS = 0.35;

function resolveQaSkillRoot() {
  const candidates = [
    process.env.YAWP_QA_VIDEO_SKILL,
    path.resolve(SKILL_ROOT, "..", "qa-video-capture"),
    path.join(process.env.HOME || "", ".claude", "skills", "qa-video-capture"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "package.json"))) return path.resolve(candidate);
  }

  throw new Error(
    `Could not find the qa-video-capture skill. Looked in:\n  ${candidates.join("\n  ")}\nSet YAWP_QA_VIDEO_SKILL to its folder.`,
  );
}

function loadPlaywright(qaSkillRoot) {
  const require = createRequire(path.join(qaSkillRoot, "package.json"));
  try {
    return require("playwright");
  } catch (err) {
    throw new Error(
      `Playwright is not installed in ${qaSkillRoot}. Run "${path.join(qaSkillRoot, "bin", "bootstrap")}" first.\n${err.message}`,
    );
  }
}

function parseArgs(argv) {
  const args = {
    url: DEFAULT_BASE_URL,
    "login-path": DEFAULT_LOGIN_PATH,
    "marker-offset": "0",
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

  if (args.help === "true") {
    printUsage();
    process.exit(0);
  }
  if (!args.storyboard) {
    printUsage();
    throw new Error("Missing required --storyboard");
  }

  return args;
}

function printUsage() {
  console.log(`Usage:
  node capture_marketing_demo.mjs --storyboard teacher-assignment-to-grading --emit-cues out/cues.json
  node capture_marketing_demo.mjs --storyboard teacher-assignment-to-grading --url http://localhost:3000 --out ~/yawp-marketing/teacher-demo
  node capture_marketing_demo.mjs --storyboard teacher-assignment-to-grading --prepared-narration out/prepared-narration.json --out ~/yawp-marketing/teacher-demo
  node capture_marketing_demo.mjs --storyboard feature-screenshots --audit

Options:
  --storyboard        Storyboard name under storyboards/ or a path to a JSON file. Required.
  --url               Base URL of the running app. Defaults to $YAWP_MARKETING_BASE_URL or ${DEFAULT_BASE_URL}.
  --out               Output directory. Defaults to ./yawp-marketing-media/<storyboard>-<timestamp>.
  --emit-cues         Write a cue file for narrate_qa_video.mjs --prepare-only, then exit.
  --prepared-narration  Prepared narration manifest. Scenes are paced to real cue audio and markers.json is written.
  --audit             Visit scene routes and check waitFor selectors only. No steps, no cues, no video pacing.
  --persona           Override the storyboard's dev-login persona (for example: teacher, student, admin).
  --no-login          Skip dev login. Use for public pages or an already-authenticated storage state.
  --storage-state     Playwright storageState JSON to load instead of dev login.
  --login-path        Dev login endpoint. Defaults to ${DEFAULT_LOGIN_PATH}.
  --width, --height   Viewport override. Storyboard viewport wins if this is unset.
  --headed            Run with a visible browser.
  --slowmo            Milliseconds of delay between Playwright actions.
  --marker-offset     Seconds added to every marker start. Use to nudge narration sync.
  --continue-on-error Keep going after a failed scene instead of exiting nonzero.

Dev login only works when the app enables local dev auth. Never point this at production
with real student data.
`);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function loadStoryboard(value) {
  const direct = path.resolve(value);
  const named = path.join(SKILL_ROOT, "storyboards", `${value}.json`);
  const resolved = fs.existsSync(direct) && fs.statSync(direct).isFile()
    ? direct
    : fs.existsSync(named)
      ? named
      : null;

  if (!resolved) {
    const available = fs.existsSync(path.join(SKILL_ROOT, "storyboards"))
      ? fs.readdirSync(path.join(SKILL_ROOT, "storyboards")).filter((name) => name.endsWith(".json"))
      : [];
    throw new Error(
      `Storyboard not found: ${value}. Available storyboards: ${available.join(", ") || "none"}`,
    );
  }

  const storyboard = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (!Array.isArray(storyboard.scenes) || storyboard.scenes.length === 0) {
    throw new Error(`Storyboard ${resolved} has no scenes`);
  }
  storyboard.sourcePath = resolved;
  // The file name, not the JSON name field, drives output paths, so
  // make_marketing_video.sh can predict them from its argument.
  storyboard.slug = path.basename(resolved, ".json");
  storyboard.name = storyboard.name || storyboard.slug;
  return storyboard;
}

/**
 * Walk the storyboard in execution order and number every narration cue.
 * Scene narration fires once the scene is on screen; step narration fires
 * at that exact point in the step list.
 */
function buildCuePlan(storyboard) {
  const cues = [];

  storyboard.scenes.forEach((scene, sceneIndex) => {
    const sceneId = scene.id || `scene-${sceneIndex + 1}`;
    if (scene.narration) {
      cues.push({ index: cues.length + 1, text: String(scene.narration).trim(), sceneId, at: "scene" });
    }
    (scene.steps || []).forEach((step, stepIndex) => {
      if (step.action === "narrate") {
        if (!step.text) throw new Error(`Scene ${sceneId} step ${stepIndex + 1} narrate is missing text`);
        cues.push({ index: cues.length + 1, text: String(step.text).trim(), sceneId, at: `step-${stepIndex + 1}` });
      }
    });
  });

  return cues;
}

function readPreparedNarration(file, cuePlan) {
  const resolved = path.resolve(file);
  const manifest = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (!Array.isArray(manifest.cues)) {
    throw new Error("--prepared-narration must be a prepared narration manifest with a cues array");
  }
  if (manifest.cues.length !== cuePlan.length) {
    throw new Error(
      `Prepared narration has ${manifest.cues.length} cues but the storyboard plans ${cuePlan.length}. Re-run --emit-cues and prepare narration again.`,
    );
  }

  const byIndex = new Map();
  manifest.cues.forEach((cue, index) => {
    const cueIndex = Number(cue.index || index + 1);
    const duration = Number(cue.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`Prepared narration cue ${cueIndex} is missing a valid duration`);
    }
    byIndex.set(cueIndex, { index: cueIndex, duration, text: String(cue.text || "").trim() });
  });

  for (const cue of cuePlan) {
    if (!byIndex.has(cue.index)) throw new Error(`Prepared narration is missing cue ${cue.index}`);
  }

  return { path: resolved, byIndex };
}

/** Rough read-aloud estimate, used only when narration audio has not been prepared. */
function estimateCueSeconds(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1.5, words / 2.6 + 0.6);
}

function resolveUrl(base, route) {
  if (/^https?:\/\//.test(route)) return route;
  return new URL(route.startsWith("/") ? route : `/${route}`, base).toString();
}

/**
 * Persona keys match packages/prisma/scripts/local-dev/dev-personas.ts, where
 * "student-graded" seeds as dev.student.graded@yawp.local.
 */
function personaEmail(persona) {
  if (!persona) return null;
  if (persona.includes("@")) return persona.toLowerCase();
  return `dev.${persona.replace(/-/g, ".")}@${DEFAULT_PERSONA_DOMAIN}`.toLowerCase();
}

function safeName(value) {
  return (
    String(value)
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "scene"
  );
}

async function devLogin(context, baseUrl, loginPath, persona) {
  const email = personaEmail(persona);
  const url = resolveUrl(baseUrl, loginPath);
  const response = await context.request.post(url, { form: { email }, maxRedirects: 5 });
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Dev login failed for ${email} (${response.status()}). Is the dev server running with local dev auth and seeded personas (bun db:seed-local-dev)?\n${body.slice(0, 400)}`,
    );
  }
  return email;
}

async function runStep(page, step, ctx) {
  const timeout = Number(step.timeout || 15000);

  switch (step.action) {
    case "goto":
      await page.goto(resolveUrl(ctx.baseUrl, step.path || step.url), {
        waitUntil: step.waitUntil || "networkidle",
        timeout: Number(step.timeout || 45000),
      });
      break;
    case "click":
      await locate(page, step).click({ timeout });
      break;
    case "hover":
      await locate(page, step).hover({ timeout });
      break;
    case "fill":
      await locate(page, step).fill(String(step.text ?? ""), { timeout });
      break;
    case "type": {
      // Clicking a rich text editor drops the caret where the click landed, so
      // "at": "end" is usually what a demo wants: keep writing the draft.
      const field = locate(page, step);
      await field.click({ timeout });
      if (step.at === "end") await page.keyboard.press("Control+End");
      await field.pressSequentially(String(step.text ?? ""), {
        delay: Number(step.delay || 45),
        timeout: Number(step.timeout || 60000),
      });
      break;
    }
    case "press":
      if (step.selector) await locate(page, step).press(String(step.key), { timeout });
      else await page.keyboard.press(String(step.key));
      break;
    case "scrollTo":
      await locate(page, step).scrollIntoViewIfNeeded({ timeout });
      break;
    case "scroll":
      await page.mouse.wheel(0, Number(step.y || 400));
      break;
    case "waitFor":
      await locate(page, step).waitFor({ state: step.state || "visible", timeout });
      break;
    case "wait":
      await page.waitForTimeout(Math.round(Number(step.seconds || 1) * 1000));
      break;
    case "screenshot":
      await captureScreenshot(page, ctx, step.name || `${ctx.sceneId}-extra`, step.fullPage === true);
      break;
    case "login":
      await devLogin(ctx.context, ctx.baseUrl, ctx.loginPath, step.persona);
      await page.goto(resolveUrl(ctx.baseUrl, step.path || "/app"), { waitUntil: "networkidle", timeout: 45000 });
      break;
    case "narrate":
      await ctx.narrate(step.text);
      break;
    default:
      throw new Error(`Unknown step action "${step.action}" in scene ${ctx.sceneId}`);
  }
}

function locate(page, step) {
  if (step.text_selector || step.role) {
    if (step.role) {
      return page.getByRole(step.role, {
        name: step.name ? new RegExp(step.name, "i") : undefined,
        exact: step.exact === true,
      }).first();
    }
    return page.getByText(step.text_selector, { exact: step.exact === true }).first();
  }
  if (!step.selector) throw new Error(`Step ${step.action} needs a selector, role, or text_selector`);
  return page.locator(step.selector).first();
}

async function captureScreenshot(page, ctx, name, fullPage) {
  const file = path.join(ctx.screenshotDir, `${String(ctx.shotCounter()).padStart(2, "0")}-${safeName(name)}.png`);
  await page.screenshot({ path: file, fullPage: Boolean(fullPage) });
  ctx.screenshots.push(file);
  return file;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const storyboard = loadStoryboard(args.storyboard);
  const cuePlan = buildCuePlan(storyboard);

  if (args["emit-cues"] && args["emit-cues"] !== "true") {
    const target = path.resolve(args["emit-cues"]);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const cueFile = cuePlan.map((cue) => ({ start: 0, text: cue.text }));
    fs.writeFileSync(target, `${JSON.stringify(cueFile, null, 2)}\n`);
    console.log(
      JSON.stringify(
        { storyboard: storyboard.name, cueFile: target, cues: cuePlan.length, plan: cuePlan },
        null,
        2,
      ),
    );
    return;
  }

  const qaSkillRoot = resolveQaSkillRoot();
  const { chromium } = loadPlaywright(qaSkillRoot);

  const audit = args.audit === "true";
  const baseUrl = args.url;
  const loginPath = args["login-path"];
  const persona = args.persona || storyboard.persona;
  const skipLogin = args["no-login"] === "true" || (!persona && !args["storage-state"]);
  const markerOffset = Number(args["marker-offset"]) || 0;
  const continueOnError = args["continue-on-error"] === "true";

  const width = Number(args.width || storyboard.viewport?.width || 1440);
  const height = Number(args.height || storyboard.viewport?.height || 900);

  const outDir = path.resolve(
    args.out || path.join("yawp-marketing-media", `${storyboard.slug}-${timestamp()}`),
  );
  const screenshotDir = path.join(outDir, "screenshots");
  const videoDir = path.join(outDir, "video");
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(videoDir, { recursive: true });

  const prepared = args["prepared-narration"] && args["prepared-narration"] !== "true"
    ? readPreparedNarration(args["prepared-narration"], cuePlan)
    : null;

  // Set YAWP_MARKETING_CHROMIUM_PATH when the machine already has a Chromium
  // build that does not match qa-video-capture's Playwright version.
  const executablePath = process.env.YAWP_MARKETING_CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({
    headless: args.headed !== "true",
    slowMo: Number(args.slowmo || 0) || undefined,
    executablePath,
  });
  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: audit ? undefined : { dir: videoDir, size: { width, height } },
    storageState:
      args["storage-state"] && args["storage-state"] !== "true"
        ? path.resolve(args["storage-state"])
        : undefined,
    deviceScaleFactor: Number(storyboard.deviceScaleFactor || 1),
  });

  const startedAt = Date.now();
  const markers = [];
  const screenshots = [];
  const sceneResults = [];
  let shots = 0;
  let cueCursor = 0;
  let failure = null;

  const page = await context.newPage();
  const video = page.video();

  const narrate = async (text) => {
    if (audit) return;
    cueCursor += 1;
    const planned = cuePlan[cueCursor - 1];
    if (!planned) throw new Error(`Fired more cues than the storyboard planned (${cuePlan.length})`);
    const start = (Date.now() - startedAt) / 1000 + markerOffset;
    markers.push({ index: planned.index, start: Number(start.toFixed(3)) });
    const duration = prepared
      ? prepared.byIndex.get(planned.index).duration
      : estimateCueSeconds(text || planned.text);
    await page.waitForTimeout(Math.ceil((duration + CUE_GAP_SECONDS) * 1000));
  };

  try {
    if (!skipLogin && !args["storage-state"]) {
      await devLogin(context, baseUrl, loginPath, persona);
    }

    for (const [sceneIndex, scene] of storyboard.scenes.entries()) {
      const sceneId = scene.id || `scene-${sceneIndex + 1}`;
      const sceneStartedAt = Date.now();
      const result = { id: sceneId, status: "ok", error: null, url: null, screenshot: null };

      const ctx = {
        baseUrl,
        context,
        loginPath,
        sceneId,
        screenshotDir,
        screenshots,
        narrate,
        shotCounter: () => (shots += 1),
      };

      try {
        const route = scene.goto || scene.route || scene.url;
        if (route) {
          result.url = resolveUrl(baseUrl, route);
          await page.goto(result.url, { waitUntil: scene.waitUntil || "networkidle", timeout: 45000 });
        }
        if (scene.waitFor) {
          await page.locator(scene.waitFor).first().waitFor({ state: "visible", timeout: Number(scene.waitForTimeout || 20000) });
        }
        if (scene.settle !== false) {
          await page.waitForTimeout(Math.round(Number(scene.settle ?? 0.8) * 1000));
        }

        if (scene.narration) await narrate(scene.narration);

        if (!audit) {
          for (const step of scene.steps || []) {
            try {
              await runStep(page, step, ctx);
            } catch (err) {
              if (step.optional === true) {
                result.status = "partial";
                console.warn(`Optional step skipped in scene ${sceneId}: ${err.message.split("\n")[0]}`);
                continue;
              }
              throw err;
            }
          }
          const hold = Number(scene.hold ?? storyboard.defaultHold ?? 1.5);
          if (hold > 0) await page.waitForTimeout(Math.round(hold * 1000));
        }

        if (scene.screenshot !== false) {
          result.screenshot = await captureScreenshot(page, ctx, scene.screenshotName || sceneId, scene.fullPage === true);
        }
      } catch (err) {
        result.status = "error";
        result.error = err.message;
        try {
          result.screenshot = await captureScreenshot(page, ctx, `FAILED-${sceneId}`, false);
        } catch {
          // A screenshot of a broken page is best effort.
        }
        console.error(`Scene ${sceneId} failed: ${err.message.split("\n")[0]}`);
        if (!continueOnError) {
          failure = err;
          result.elapsedMs = Date.now() - sceneStartedAt;
          sceneResults.push(result);
          break;
        }
      }

      result.elapsedMs = Date.now() - sceneStartedAt;
      sceneResults.push(result);
    }
  } finally {
    await context.close();
    await browser.close();
  }

  let videoPath = null;
  if (!audit && video) {
    const recorded = await video.path();
    videoPath = path.join(videoDir, `${storyboard.slug}.webm`);
    if (recorded !== videoPath) fs.renameSync(recorded, videoPath);
  }

  const cuesPath = path.join(outDir, "cues.json");
  fs.writeFileSync(
    cuesPath,
    `${JSON.stringify(cuePlan.map((cue) => ({ start: 0, text: cue.text })), null, 2)}\n`,
  );

  const markersPath = path.join(outDir, "markers.json");
  fs.writeFileSync(markersPath, `${JSON.stringify(markers, null, 2)}\n`);

  const narrationPath = path.join(outDir, "narration.txt");
  fs.writeFileSync(narrationPath, `${cuePlan.map((cue) => cue.text).join("\n\n")}\n`);

  const manifest = {
    createdAt: new Date().toISOString(),
    storyboard: {
      slug: storyboard.slug,
      name: storyboard.name,
      title: storyboard.title || null,
      audience: storyboard.audience || null,
      source: storyboard.sourcePath,
    },
    mode: audit ? "audit" : prepared ? "narrated-capture" : "capture",
    baseUrl,
    persona: skipLogin ? null : personaEmail(persona),
    viewport: { width, height },
    preparedNarration: prepared?.path || null,
    markerOffset,
    cues: cuePlan,
    firedCues: markers.length,
    scenes: sceneResults,
    screenshots,
    video: videoPath,
    files: { cues: cuesPath, markers: markersPath, narration: narrationPath },
  };
  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        outDir,
        manifestPath,
        video: videoPath,
        screenshots,
        markers: markersPath,
        firedCues: markers.length,
        plannedCues: cuePlan.length,
        scenes: sceneResults.map(({ id, status, error }) => ({ id, status, error })),
      },
      null,
      2,
    ),
  );

  if (failure) throw failure;
  if (sceneResults.some((scene) => scene.status === "error")) {
    process.exitCode = 1;
  }
  if (!audit && prepared && markers.length !== cuePlan.length) {
    console.error(
      `Only ${markers.length} of ${cuePlan.length} cues fired. Muxing with an incomplete markers file will fail.`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
