#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_KOKORO_HELPER = path.join(__dirname, "kokoro_local_tts_qa_video.py");
const DEFAULT_QA_VIDEO_HOME = process.env.QA_VIDEO_HOME || path.join(
  process.env.HOME || "",
  ".qa-video-capture",
);
const DEFAULT_KOKORO_PYTHON = path.join(
  DEFAULT_QA_VIDEO_HOME,
  "kokoro",
  "venv",
  "bin",
  "python",
);
const DEFAULT_VOICE = "af_sarah";
const DEFAULT_VOICE_SPEED = 1.08;
const DEFAULT_LANG = "en-us";

function parseArgs(argv) {
  const args = {
    "kokoro-helper": process.env.QA_VIDEO_KOKORO_HELPER || DEFAULT_KOKORO_HELPER,
    python: process.env.QA_VIDEO_KOKORO_PYTHON || (fs.existsSync(DEFAULT_KOKORO_PYTHON) ? DEFAULT_KOKORO_PYTHON : "python3"),
    voice: process.env.QA_VIDEO_KOKORO_VOICE || DEFAULT_VOICE,
    "voice-speed": process.env.QA_VIDEO_KOKORO_SPEED || String(DEFAULT_VOICE_SPEED),
    lang: process.env.QA_VIDEO_KOKORO_LANG || DEFAULT_LANG,
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

  const hasNarrationInput = Boolean(args.text || args["text-file"] || args["script-file"] || args["cue-file"]);
  const usesPreparedManifest = Boolean(args["prepared-manifest"]);
  const prepareOnly = args["prepare-only"] === "true";

  if (prepareOnly && usesPreparedManifest) {
    throw new Error("Use either --prepare-only or --prepared-manifest, not both");
  }
  if (usesPreparedManifest && hasNarrationInput) {
    throw new Error("Use either --prepared-manifest or narration text/cues, not both");
  }
  if (prepareOnly && !args.out) {
    throw new Error("--prepare-only requires --out pointing to the prepared narration manifest");
  }
  if (!prepareOnly && !args.video) throw new Error("Missing required --video");
  if (!hasNarrationInput && !usesPreparedManifest) {
    throw new Error("Provide --text, --text-file, --script-file, --cue-file, or --prepared-manifest");
  }

  return args;
}

function printUsage() {
  console.log(`Usage:
  node narrate_qa_video.mjs --video input.mp4 --script-file narration.txt --out output-narrated.mp4
  node narrate_qa_video.mjs --video input.mp4 --cue-file cues.json --out output-narrated.mp4
  node narrate_qa_video.mjs --prepare-only --cue-file cues.json --out prepared-narration.json
  node narrate_qa_video.mjs --video input.mp4 --prepared-manifest prepared-narration.json --markers-file markers.json --out output-narrated.mp4

Environment:
  QA_VIDEO_HOME             Optional. Defaults to ~/.qa-video-capture.
  QA_VIDEO_KOKORO_PYTHON    Optional. Defaults to the local Kokoro venv, then python3.
  QA_VIDEO_KOKORO_HELPER    Optional. Defaults to this skill's Kokoro helper script.
  QA_VIDEO_KOKORO_VOICE     Optional. Defaults to Sarah (${DEFAULT_VOICE}).
  QA_VIDEO_KOKORO_SPEED     Optional. Defaults to ${DEFAULT_VOICE_SPEED}.
  QA_VIDEO_KOKORO_LANG      Optional. Defaults to ${DEFAULT_LANG}.

cue-file JSON:
  [
    { "start": 0, "text": "We start on the dashboard." },
    { "start": "00:07.5", "text": "After removing the item, the count is zero." }
  ]

markers-file JSON:
  [
    { "index": 1, "start": 0 },
    { "index": 2, "start": "00:07.5" }
  ]
`);
}

function readNarration(args) {
  if (args["cue-file"]) {
    return readCueFile(args["cue-file"]);
  }

  const parts = [];
  if (args.text) parts.push(args.text);
  const file = args["text-file"] || args["script-file"];
  if (file) parts.push(fs.readFileSync(path.resolve(file), "utf8"));

  const text = parts.join("\n\n").trim();
  if (!text) throw new Error("Narration text is empty");
  return [{ index: 1, start: 0, text }];
}

function readCueFile(file) {
  const resolved = path.resolve(file);
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  const rawCues = Array.isArray(parsed) ? parsed : parsed.cues;
  if (!Array.isArray(rawCues)) {
    throw new Error("--cue-file must be a JSON array or an object with a cues array");
  }

  const cues = rawCues
    .map((cue, index) => ({
      index: index + 1,
      start: parseTimestamp(cue.start ?? cue.time ?? cue.at ?? 0),
      text: String(cue.text ?? cue.narration ?? cue.say ?? "").trim(),
    }))
    .filter((cue) => cue.text.length > 0)
    .sort((a, b) => a.start - b.start);

  if (cues.length === 0) throw new Error("--cue-file did not contain any nonempty narration cues");
  return cues;
}

function readPreparedManifest(file) {
  const resolved = path.resolve(file);
  const manifest = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (!Array.isArray(manifest.cues)) {
    throw new Error("--prepared-manifest must contain a cues array");
  }

  const baseDir = path.dirname(resolved);
  const cues = manifest.cues.map((cue, index) => {
    const audioPath = path.isAbsolute(cue.audioPath)
      ? cue.audioPath
      : path.resolve(baseDir, cue.audioPath);
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Prepared narration audio is missing for cue ${cue.index || index + 1}: ${audioPath}`);
    }
    if (fs.statSync(audioPath).size <= 0) {
      throw new Error(`Prepared narration audio is empty for cue ${cue.index || index + 1}: ${audioPath}`);
    }

    const duration = Number(cue.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`Prepared narration cue ${cue.index || index + 1} is missing a valid duration`);
    }

    return {
      index: Number(cue.index || index + 1),
      start: parseTimestamp(cue.start ?? 0),
      duration,
      text: String(cue.text || "").trim(),
      audioPath,
    };
  });

  if (cues.length === 0) throw new Error("--prepared-manifest did not contain any cues");
  return { manifest, cues };
}

function applyMarkers(cues, file) {
  if (!file) return cues;

  const resolved = path.resolve(file);
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  const rawMarkers = Array.isArray(parsed) ? parsed : parsed.markers;
  if (!Array.isArray(rawMarkers)) {
    throw new Error("--markers-file must be a JSON array or an object with a markers array");
  }

  const markers = new Map(rawMarkers.map((marker, index) => {
    const cueIndex = Number(marker.index ?? marker.cueIndex ?? marker.cue ?? index + 1);
    if (!Number.isFinite(cueIndex) || cueIndex <= 0) {
      throw new Error(`Invalid narration marker index: ${marker.index ?? marker.cueIndex ?? marker.cue}`);
    }
    return [cueIndex, parseTimestamp(marker.start ?? marker.time ?? marker.at ?? 0)];
  }));

  const marked = cues.map((cue) => {
    if (!markers.has(cue.index)) return cue;
    return { ...cue, start: markers.get(cue.index) };
  });
  const missingMarkers = cues
    .filter((cue) => !markers.has(cue.index))
    .map((cue) => cue.index);
  if (missingMarkers.length > 0) {
    throw new Error(`--markers-file is missing cue indexes: ${missingMarkers.join(", ")}`);
  }

  return marked;
}

function parseTimestamp(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid cue start: ${value}`);
    return value;
  }

  const text = String(value).trim();
  if (!text.includes(":")) {
    const seconds = Number(text);
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`Invalid cue start: ${value}`);
    return seconds;
  }

  const parts = text.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part) || part < 0) || parts.length > 3) {
    throw new Error(`Invalid cue start: ${value}`);
  }

  return parts.reduce((total, part) => total * 60 + part, 0);
}

function defaultOutPath(videoPath) {
  const ext = ".mp4";
  const dir = path.dirname(videoPath);
  const stem = path.basename(videoPath, path.extname(videoPath));
  return path.join(dir, `${stem}-narrated${ext}`);
}

function makeWorkDir(args, outPath) {
  if (args["work-dir"]) return path.resolve(args["work-dir"]);
  const stem = path.basename(outPath, path.extname(outPath));
  return path.join(path.dirname(outPath), `${stem}-audio`);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
}

function requireCommand(command) {
  const result = run(command, ["-version"]);
  if (result.status !== 0) {
    throw new Error(`${command} is required but was not found on PATH`);
  }
}

function probeDuration(file) {
  const result = run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  if (result.status !== 0) {
    throw new Error(`ffprobe failed for ${file}:\n${result.stderr || result.stdout}`);
  }

  const duration = Number(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not determine duration for ${file}`);
  }
  return duration;
}

function parseVoiceSpeed(value) {
  const speed = Number(value);
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new Error(`--voice-speed must be a positive number, got ${value}`);
  }
  return speed;
}

function synthesizeCue(cue, audioPath, textPath, args, voiceSpeed) {
  const helper = path.resolve(args["kokoro-helper"]);
  if (!fs.existsSync(helper)) {
    throw new Error(`Kokoro helper is missing: ${helper}`);
  }

  const commandArgs = [
    helper,
    "--text-file",
    textPath,
    "--audio-out",
    audioPath,
    "--voice",
    args.voice,
    "--speed",
    String(voiceSpeed),
    "--lang",
    args.lang,
  ];
  if (args["model-dir"]) {
    commandArgs.push("--model-dir", path.resolve(args["model-dir"]));
  }

  const result = run(args.python, commandArgs);
  if (result.status !== 0) {
    const details = result.stderr || result.stdout || result.error?.message || "unknown error";
    throw new Error(`Kokoro Sarah TTS failed for cue ${cue.index}:\n${details}`);
  }
  if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size <= 0) {
    throw new Error(`Kokoro Sarah TTS did not create audio for cue ${cue.index}: ${audioPath}`);
  }
}

function buildFilter(cues, videoDuration) {
  const duration = videoDuration.toFixed(3);
  const filters = cues.map((cue, index) => {
    const delayMs = Math.max(0, Math.round(cue.start * 1000));
    return `[${index + 1}:a]adelay=${delayMs}:all=1,apad,atrim=0:${duration},asetpts=PTS-STARTPTS[a${index}]`;
  });
  const inputs = cues.map((_, index) => `[a${index}]`).join("");
  return `${filters.join(";")};${inputs}amix=inputs=${cues.length}:duration=longest:normalize=0,atrim=0:${duration},asetpts=PTS-STARTPTS[narration]`;
}

function muxNarration(videoPath, outputPath, cues, videoDuration) {
  const args = [
    "-y",
    "-i",
    videoPath,
    ...cues.flatMap((cue) => ["-i", cue.audioPath]),
    "-filter_complex",
    buildFilter(cues, videoDuration),
    "-map",
    "0:v:0",
    "-map",
    "[narration]",
    "-c:v",
    "libx264",
    "-profile:v",
    "baseline",
    "-level",
    "4.0",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-t",
    videoDuration.toFixed(3),
    outputPath,
  ];

  const result = run("ffmpeg", args);
  if (result.status !== 0) {
    throw new Error(`ffmpeg narration mux failed:\n${result.stderr || result.stdout}`);
  }
}

function checkCueDurations(cues, videoDuration, options = {}) {
  const allowOverrun = options.allowOverrun === true;
  const allowOverlap = options.allowOverlap === true;
  const ordered = [...cues].sort((a, b) => a.start - b.start);

  for (const cue of ordered) {
    const end = cue.start + cue.duration;
    if (end > videoDuration + 0.5 && !allowOverrun) {
      throw new Error(
        `Cue ${cue.index} narration ends at ${end.toFixed(1)}s, beyond the ${videoDuration.toFixed(1)}s video. Shorten the text, move the cue earlier, record a longer video, or pass --allow-overrun true to cut it at video end.`,
      );
    }
  }

  if (allowOverlap) return;

  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    const previousEnd = previous.start + previous.duration;
    const overlap = previousEnd - current.start;
    if (overlap > 0.1) {
      throw new Error(
        `Cue ${previous.index} overlaps cue ${current.index} by ${overlap.toFixed(1)}s. Wait for cue ${previous.index}'s narration duration before moving to the next browser action, or shorten the narration. Pass --allow-overlap true only for intentional audio mixing.`,
      );
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  requireCommand("ffprobe");

  const prepareOnly = args["prepare-only"] === "true";
  const usesPreparedManifest = Boolean(args["prepared-manifest"]);
  const voiceSpeed = parseVoiceSpeed(args["voice-speed"]);
  let synthesized;
  let workDir;
  let preparedSource = null;

  if (usesPreparedManifest) {
    const prepared = readPreparedManifest(args["prepared-manifest"]);
    synthesized = prepared.cues;
    preparedSource = prepared.manifest;
  } else {
    const cues = readNarration(args);

    const manifestTarget = prepareOnly
      ? path.resolve(args.out)
      : path.resolve(args.out || defaultOutPath(path.resolve(args.video)));
    workDir = makeWorkDir(args, manifestTarget);
    fs.mkdirSync(workDir, { recursive: true });

    synthesized = [];
    for (const cue of cues) {
      const cueStem = String(cue.index).padStart(2, "0");
      const textPath = path.join(workDir, `${cueStem}.txt`);
      const audioPath = path.join(workDir, `${cueStem}.wav`);
      fs.writeFileSync(textPath, `${cue.text}\n`);
      synthesizeCue(cue, audioPath, textPath, args, voiceSpeed);
      synthesized.push({
        ...cue,
        audioPath,
        duration: probeDuration(audioPath),
      });
    }

    if (prepareOnly) {
      const preparedManifestPath = path.resolve(args.out);
      const preparedManifest = {
        createdAt: new Date().toISOString(),
        preparedOnly: true,
        ttsProvider: "kokoro_local",
        voice: args.voice,
        voiceSpeed,
        lang: args.lang,
        kokoroHelper: path.resolve(args["kokoro-helper"]),
        python: args.python,
        modelDir: args["model-dir"] ? path.resolve(args["model-dir"]) : null,
        workDir,
        cues: synthesized.map((cue) => ({
          index: cue.index,
          start: cue.start,
          duration: cue.duration,
          text: cue.text,
          audioPath: cue.audioPath,
        })),
      };
      fs.writeFileSync(preparedManifestPath, `${JSON.stringify(preparedManifest, null, 2)}\n`);
      console.log(JSON.stringify({
        preparedManifestPath,
        audioFiles: synthesized.map((cue) => cue.audioPath),
        ttsProvider: "kokoro_local",
        voice: args.voice,
        voiceSpeed,
        lang: args.lang,
      }, null, 2));
      return;
    }
  }

  requireCommand("ffmpeg");

  const videoPath = path.resolve(args.video);
  if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);
  if (fs.statSync(videoPath).size <= 0) throw new Error(`Video is empty: ${videoPath}`);

  const outputPath = path.resolve(args.out || defaultOutPath(videoPath));
  if (outputPath === videoPath) throw new Error("--out must not be the same path as --video");

  const videoDuration = probeDuration(videoPath);
  const markedCues = applyMarkers(synthesized, args["markers-file"]);
  checkCueDurations(markedCues, videoDuration, {
    allowOverrun: args["allow-overrun"] === "true",
    allowOverlap: args["allow-overlap"] === "true",
  });
  muxNarration(videoPath, outputPath, markedCues, videoDuration);

  const manifestPath = path.join(path.dirname(outputPath), `${path.basename(outputPath, path.extname(outputPath))}-narration.json`);
  const manifest = {
    createdAt: new Date().toISOString(),
    sourceVideo: videoPath,
    outputVideo: outputPath,
    videoDuration,
    ttsProvider: preparedSource?.ttsProvider || "kokoro_local",
    voice: preparedSource?.voice || args.voice,
    voiceSpeed: preparedSource?.voiceSpeed || voiceSpeed,
    lang: preparedSource?.lang || args.lang,
    kokoroHelper: preparedSource?.kokoroHelper || path.resolve(args["kokoro-helper"]),
    python: preparedSource?.python || args.python,
    modelDir: preparedSource?.modelDir || (args["model-dir"] ? path.resolve(args["model-dir"]) : null),
    preparedManifest: args["prepared-manifest"] ? path.resolve(args["prepared-manifest"]) : null,
    markersFile: args["markers-file"] ? path.resolve(args["markers-file"]) : null,
    workDir: workDir || null,
    cues: markedCues.map((cue) => ({
      index: cue.index,
      start: cue.start,
      duration: cue.duration,
      text: cue.text,
      audioPath: cue.audioPath,
    })),
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(JSON.stringify({
    outputVideo: outputPath,
    manifestPath,
    audioFiles: markedCues.map((cue) => cue.audioPath),
    videoDuration,
    ttsProvider: preparedSource?.ttsProvider || "kokoro_local",
    voice: preparedSource?.voice || args.voice,
    voiceSpeed: preparedSource?.voiceSpeed || voiceSpeed,
    lang: preparedSource?.lang || args.lang,
  }, null, 2));
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
