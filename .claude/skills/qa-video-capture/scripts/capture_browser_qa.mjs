#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

function parseArgs(argv) {
  const args = {
    routes: "/",
    seconds: "5",
    width: "1440",
    height: "1000",
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

  if (!args.url) {
    throw new Error("Missing required --url");
  }

  return args;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeName(value) {
  return value
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "root";
}

function resolveUrl(base, route) {
  if (/^https?:\/\//.test(route)) return route;
  return new URL(route.startsWith("/") ? route : `/${route}`, base).toString();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = args.url;
  const routes = args.routes.split(",").map((route) => route.trim()).filter(Boolean);
  const seconds = Number(args.seconds);
  const width = Number(args.width);
  const height = Number(args.height);
  const outDir = path.resolve(args.out || path.join("qa-media", timestamp()));
  const screenshotDir = path.join(outDir, "screenshots");
  const videoDir = path.join(outDir, "videos");

  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(videoDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: videoDir, size: { width, height } },
  });
  const page = await context.newPage();
  const manifest = {
    createdAt: new Date().toISOString(),
    baseUrl,
    viewport: { width, height },
    routes: [],
  };

  for (const route of routes) {
    const url = resolveUrl(baseUrl, route);
    const startedAt = Date.now();
    let title = "";
    let status = "ok";
    let error = null;

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(Math.max(0, seconds) * 1000);
      title = await page.title();
    } catch (err) {
      status = "error";
      error = err.message;
    }

    const screenshot = path.join(screenshotDir, `${safeName(route)}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    manifest.routes.push({
      route,
      url,
      title,
      status,
      error,
      screenshot,
      elapsedMs: Date.now() - startedAt,
    });
  }

  await context.close();
  await browser.close();

  const videos = fs.readdirSync(videoDir)
    .filter((name) => name.endsWith(".webm"))
    .map((name) => path.join(videoDir, name));
  manifest.videos = videos;

  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ outDir, manifestPath, videos, screenshots: manifest.routes.map((route) => route.screenshot) }, null, 2));
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
