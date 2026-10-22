#!/usr/bin/env bash
# Records the NCTE booth video from scratch. See README.md in this folder.
#
#   bash services/web-app/scripts/booth-video/run.sh [output.mp4]
#
# Wipes and re-seeds the LOCAL dev database (./bin/project bootstrap --fresh).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
WEB="$ROOT/services/web-app"
OUT="$(realpath -m "${1:-$ROOT/yawp-ncte-booth.mp4}")"
WORK="${BOOTH_WORK_DIR:-${TMPDIR:-/tmp}/booth-video}"
STAND_IN_PORT="${BOOTH_STAND_IN_PORT:-5199}"

for font in Roboto 'Cormorant Garamond'; do
  fc-list : family | grep -i "$font" >/dev/null || { echo "Install the $font font first (see README.md)." >&2; exit 1; }
done
for tool in ffmpeg xvfb-run bun; do
  command -v "$tool" >/dev/null || { echo "$tool is required." >&2; exit 1; }
done

rm -rf "$WORK" && mkdir -p "$WORK"
cd "$ROOT"
./bin/project dev stop --json >/dev/null || true
./bin/project bootstrap --fresh --json >/dev/null

DATABASE_URL="$(grep '^DATABASE_URL=' "$WEB/.env" | cut -d= -f2- | tr -d '"')"
export DATABASE_URL
(cd "$WEB" && bun scripts/booth-video/seed-booth.ts base)

node "$HERE/fake-anthropic.mjs" --port "$STAND_IN_PORT" --log "$WORK/model-requests.jsonl" > "$WORK/stand-in.log" 2>&1 &
STAND_IN_PID=$!
trap 'kill $STAND_IN_PID 2>/dev/null || true' EXIT

# The app talks to the stand-in instead of Anthropic. Class Summaries run live
# (not the dev fixture), and the Blackboard grade-passback mock is off: with no
# mock listening, releasing a grade would crash the dev server.
export ANTHROPIC_BASE_URL="http://127.0.0.1:$STAND_IN_PORT"
export ANTHROPIC_API_KEY=booth-video-stand-in
export ANTHROPIC_OUTAGE_FALLBACK_ENABLED=false
export CLASS_INSIGHT_MOCK_MODE=live
export BLACKBOARD_LTI_MOCK_URL=
./bin/project dev start --json >/dev/null

cd "$WEB"
xvfb-run -a -s "-screen 0 1920x1080x24" node scripts/booth-video/record.mjs --out "$WORK/clips"
node scripts/booth-video/assemble.mjs --clips "$WORK/clips" --out "$OUT"

if grep -q '"rule":"UNSCRIPTED"' "$WORK/model-requests.jsonl"; then
  echo "Warning: some model calls had no scripted reply; see $WORK/model-requests.jsonl" >&2
fi
