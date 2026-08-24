#!/bin/sh
# End-to-end narrated marketing video for one storyboard.
#
#   scripts/make_marketing_video.sh <storyboard> [output-dir] [base-url]
#
# Steps:
#   1. emit narration cues from the storyboard
#   2. synthesize narration audio with qa-video-capture (Kokoro, local)
#   3. run the storyboard, pacing each scene to real cue audio, writing markers
#   4. mux narration onto the recorded video as H.264/AAC MP4
#
# Publishing stays manual. Run qa-video-capture/scripts/publish_qa_video.mjs
# yourself once you have reviewed the MP4.
set -eu

STORYBOARD=${1:-}
if [ -z "$STORYBOARD" ]; then
  echo "Usage: $0 <storyboard> [output-dir] [base-url]" >&2
  exit 1
fi

SKILL_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUT_DIR=${2:-"$PWD/yawp-marketing-media/$STORYBOARD"}
BASE_URL=${3:-${YAWP_MARKETING_BASE_URL:-http://localhost:3000}}

QA_SKILL=${YAWP_QA_VIDEO_SKILL:-"$SKILL_ROOT/../qa-video-capture"}
if [ ! -f "$QA_SKILL/package.json" ]; then
  QA_SKILL="$HOME/.claude/skills/qa-video-capture"
fi
if [ ! -f "$QA_SKILL/package.json" ]; then
  echo "Could not find the qa-video-capture skill. Set YAWP_QA_VIDEO_SKILL." >&2
  exit 1
fi
QA_SKILL=$(CDPATH= cd -- "$QA_SKILL" && pwd)

mkdir -p "$OUT_DIR"

echo "1/4 emitting narration cues"
node "$SKILL_ROOT/scripts/capture_marketing_demo.mjs" \
  --storyboard "$STORYBOARD" \
  --emit-cues "$OUT_DIR/cues.json" >/dev/null

echo "2/4 synthesizing narration audio"
node "$QA_SKILL/scripts/narrate_qa_video.mjs" \
  --prepare-only \
  --cue-file "$OUT_DIR/cues.json" \
  --out "$OUT_DIR/prepared-narration.json" >/dev/null

echo "3/4 capturing storyboard against $BASE_URL"
node "$SKILL_ROOT/scripts/capture_marketing_demo.mjs" \
  --storyboard "$STORYBOARD" \
  --url "$BASE_URL" \
  --prepared-narration "$OUT_DIR/prepared-narration.json" \
  --out "$OUT_DIR/capture"

echo "4/4 muxing narration onto video"
node "$QA_SKILL/scripts/narrate_qa_video.mjs" \
  --video "$OUT_DIR/capture/video/$STORYBOARD.webm" \
  --prepared-manifest "$OUT_DIR/prepared-narration.json" \
  --markers-file "$OUT_DIR/capture/markers.json" \
  --out "$OUT_DIR/$STORYBOARD.mp4"

echo
echo "Done: $OUT_DIR/$STORYBOARD.mp4"
echo "Screenshots: $OUT_DIR/capture/screenshots"
echo "Watch it before sending it anywhere."
