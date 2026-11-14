#!/usr/bin/env bash
# Count clickable elements with hand-styled primary CTA classes (not using <Button>).
set -euo pipefail
ROOT="${1:-services/web-app}"
PATTERN='bg-primary|bg-\[#|hover:bg-primary|coral|terracotta|(?:^|[\s"'\''`])bg-(?:gold|amber)|rounded-full.*(?:px-|py-).*'
MATCHES=0
while IFS= read -r -d '' file; do
  awk -v pat="$PATTERN" '
    /<(?:button|Link|a)\b/ { tag=1; buf=$0; start=NR; next }
    tag {
      buf=buf "\n" $0
      if (/>/ || /<\//) {
        if (buf !~ /<Button\b/ && buf ~ pat) {
          print FILENAME ":" start
        }
        tag=0; buf=""
      }
    }
  ' "$file"
done < <(find "$ROOT" \( -name '*.tsx' -o -name '*.jsx' \) -print0) | sort -u | tee /tmp/hand-styled-ctas.txt | wc -l | awk '{print $1}'