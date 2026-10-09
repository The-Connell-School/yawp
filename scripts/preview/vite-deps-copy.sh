#!/bin/sh
# Runs inside a throwaway oven/bun container. Every read/write of a per-PR
# node_modules/.vite/deps directory goes through here.
set -eu

APP=web
COMMAND="${1:?usage: vite-deps-copy.sh seed|clear|harvest}"
STAMP="${SEED_STAMP:-0}"
EXPECT="${EXPECT_LOCKFILE_HASH:-}"

verify() {
  bun /opt/check-vite-deps.mjs "$1" "$EXPECT"
}

do_seed() {
  src="/tpl/$APP"
  vol="/vol/$APP"
  vite_dir="$vol/.vite"
  stage="$vite_dir/deps.seed.$STAMP"
  old="$vite_dir/deps.old.$STAMP"

  verify "$src"

  mkdir -p "$vite_dir"
  rm -rf "$vite_dir"/deps.seed.* "$old"
  mkdir -p "$stage"
  (cd "$src" && cp -a . "$stage")
  verify "$stage"

  if [ -d "$vite_dir/deps" ]; then
    mv "$vite_dir/deps" "$old"
  fi
  if ! mv "$stage" "$vite_dir/deps"; then
    if [ -d "$old" ]; then
      mv "$old" "$vite_dir/deps"
    fi
    echo "vite-deps-copy: failed to install seeded cache" >&2
    exit 1
  fi
  rm -rf "$old"
  echo "vite-deps-copy: seeded $APP"
}

do_clear() {
  vol="/vol/$APP"
  rm -rf "$vol/.vite/deps" "$vol/.vite"/deps.seed.* "$vol/.vite"/deps.old.*
  echo "vite-deps-copy: cleared $APP"
}

do_harvest() {
  src="/vol/$APP/.vite/deps"
  verify "$src"
  mkdir -p "/out/$APP"
  (cd "$src" && cp -a . "/out/$APP")
  verify "/out/$APP"
  echo "vite-deps-copy: harvested $APP"
  if [ -n "${OWNER:-}" ]; then
    chown -R "$OWNER" /out
  fi
}

case "$COMMAND" in
  seed) do_seed ;;
  clear) do_clear ;;
  harvest) do_harvest ;;
  *)
    echo "vite-deps-copy: unknown command $COMMAND" >&2
    exit 2
    ;;
esac
