#!/usr/bin/env python3
"""Create local Kokoro Sarah TTS audio or a narrated QA video.

This helper uses local open-source TTS. It expects Kokoro model files and Python
dependencies to be installed by this package's bootstrap script.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_HOME = Path(os.environ.get("QA_VIDEO_HOME", Path.home() / ".qa-video-capture"))
DEFAULT_CACHE = DEFAULT_HOME / "kokoro"
DEFAULT_MODEL_DIR = DEFAULT_CACHE / "model"
DEFAULT_VOICE = "af_sarah"


def fail(message: str, code: int = 2) -> int:
    print(json.dumps({"status": "failed", "error": message}, indent=2), file=sys.stderr)
    return code


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video")
    parser.add_argument("--text-file", required=True)
    parser.add_argument("--out")
    parser.add_argument("--audio-out")
    parser.add_argument("--voice", default=os.environ.get("QA_VIDEO_KOKORO_VOICE", DEFAULT_VOICE))
    parser.add_argument("--speed", type=float, default=float(os.environ.get("QA_VIDEO_KOKORO_SPEED", "1.08")))
    parser.add_argument("--lang", default=os.environ.get("QA_VIDEO_KOKORO_LANG", "en-us"))
    parser.add_argument("--model-dir", default=os.environ.get("QA_VIDEO_KOKORO_MODEL_DIR", str(DEFAULT_MODEL_DIR)))
    parser.add_argument("--ffmpeg", default=shutil.which("ffmpeg") or "ffmpeg")
    args = parser.parse_args()
    if not args.audio_out and (not args.video or not args.out):
        parser.error("either --audio-out, or both --video and --out, is required")
    return args


def main() -> int:
    args = parse_args()
    text_file = Path(args.text_file).expanduser().resolve()
    video = Path(args.video).expanduser().resolve() if args.video else None
    out = Path(args.out).expanduser().resolve() if args.out else None
    audio_out = Path(args.audio_out).expanduser().resolve() if args.audio_out else None
    model_dir = Path(args.model_dir).expanduser().resolve()
    model = model_dir / "kokoro-v1.0.int8.onnx"
    voices = model_dir / "voices-v1.0.bin"

    if video and (not video.exists() or video.stat().st_size <= 0):
        return fail(f"source video is missing or empty: {video}")
    if not text_file.exists() or text_file.stat().st_size <= 0:
        return fail(f"narration text file is missing or empty: {text_file}")
    if not model.exists():
        return fail(f"Kokoro model is missing: {model}")
    if not voices.exists():
        return fail(f"Kokoro voices file is missing: {voices}")
    if not audio_out and not shutil.which(args.ffmpeg):
        return fail(f"ffmpeg is unavailable: {args.ffmpeg}")

    try:
        from kokoro_onnx import Kokoro
        import soundfile as sf
    except Exception as exc:  # pragma: no cover - environment-specific
        return fail(f"Kokoro Python dependencies are unavailable: {exc}")

    text = text_file.read_text(encoding="utf-8").strip()
    if not text:
        return fail("narration text is empty")

    audio = audio_out or out.with_suffix(f".{args.voice}.wav")
    audio.parent.mkdir(parents=True, exist_ok=True)
    manifest = out.with_name(f"{out.stem}-narration.json") if out else audio.with_suffix(".json")

    kokoro = Kokoro(str(model), str(voices))
    if args.voice not in kokoro.voices:
        return fail(f"Kokoro voice is unavailable: {args.voice}")
    samples, sample_rate = kokoro.create(text, voice=args.voice, speed=args.speed, lang=args.lang)
    sf.write(audio, samples, sample_rate)

    if audio_out:
        payload = {
            "createdAt": now(),
            "narrationStatus": f"kokoro_{args.voice}",
            "voice": args.voice,
            "speed": args.speed,
            "lang": args.lang,
            "model": str(model),
            "voices": str(voices),
            "audioPath": str(audio),
            "textFile": str(text_file),
        }
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    command = [
        args.ffmpeg,
        "-y",
        "-i",
        str(video),
        "-i",
        str(audio),
        "-filter_complex",
        "[0:v]tpad=stop_mode=clone:stop_duration=120[v]",
        "-map",
        "[v]",
        "-map",
        "1:a:0",
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
        "-shortest",
        str(out),
    ]
    result = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if result.returncode != 0:
        return fail(f"ffmpeg mux failed:\n{result.stdout}", code=3)
    if not out.exists() or out.stat().st_size <= 0:
        return fail(f"output video was not created: {out}", code=4)

    payload = {
        "createdAt": now(),
        "sourceVideo": str(video),
        "outputVideo": str(out),
        "manifestPath": str(manifest),
        "narrationStatus": f"kokoro_{args.voice}",
        "voice": args.voice,
        "speed": args.speed,
        "lang": args.lang,
        "model": str(model),
        "voices": str(voices),
        "audioPath": str(audio),
        "textFile": str(text_file),
        "ffmpegCommand": command,
    }
    manifest.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
