#!/usr/bin/env bash
set -euo pipefail

body_file="${1:?usage: check-skip-preview.sh <pr-body-file>}"
output_file="${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

first_line="$(sed -n '1{s/\r$//;p;q;}' "$body_file")"

if [[ "$first_line" == "[skip preview]" ]]; then
  echo "skip_preview=true" >> "$output_file"
  echo "PR preview skipped because the PR body starts with [skip preview]."
else
  echo "skip_preview=false" >> "$output_file"
  echo "PR preview allowed; PR body does not start with [skip preview]."
fi
