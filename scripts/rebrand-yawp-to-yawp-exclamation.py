#!/usr/bin/env python3
"""User-facing YAWP! / YAWP → Yawp! (skip identifiers, env, URLs)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "services" / "web-app"

SKIP_LINE = re.compile(
    r"YAWP_[A-Z]|feature_flag\.|/yawp|yawp-|"
    r"YAWP_ENVIRONMENT|YAWP_INTERNAL|YAWP_MANAGEMENT|YAWP_PUBLIC|YAWP_APP|"
    r"YAWP_CONTENT|YAWP_16|YAWP_MARKETING|YAWP_PRODUCTION|YAWP_SHARING|"
    r"process\.env|console\.|logger\.|Sentry\.|yawp_pr_"
)

GLOBS = [
    "app/**/*.tsx",
    "app/**/*.ts",
    "app/**/*.snap",
    "app/**/*.md",
    "e2e/**/*.ts",
    "e2e/**/*.tsx",
    "e2e-gated/**/*.ts",
    "e2e/fixtures/**/*.{ts,tsx,html}",
]

# Whole-file skip (non user-facing or generated elsewhere)
SKIP_FILES = {
    "app/utils/internal-copy.ts",
    "app/domain/feature-flags/feature-flags.ts",
    "app/routes/app_.documents_.$id/document-editor/use-paste-alert.ts",
    "app/routes/app_.documents_.$id/document-editor/extensions/pasted-source.ts",
}


def transform_line(line: str) -> str:
    if SKIP_LINE.search(line):
        return line.replace("Yawp!.", "Yawp!").replace("Yawp!?", "Yawp!")
    if "YAWP" not in line and "Yawp!." not in line and "Yawp!?" not in line:
        return line
    out = line
    out = out.replace("YAWP!?", "Yawp!")
    out = out.replace("YAWP!.", "Yawp!")
    out = out.replace("YAWP!'s", "Yawp!'s")
    out = out.replace("YAWP!’s", "Yawp!'s")
    out = out.replace("YAWP!&rsquo;s", "Yawp!&rsquo;s")
    out = out.replace("YAWP!", "Yawp!")
    # Remaining standalone YAWP (not part of identifier)
    out = re.sub(r"(?<![A-Za-z0-9_/])YAWP(?![!a-zA-Z_/])", "Yawp!", out)
    out = out.replace("Yawp!-ROCKS", "YAWP-ROCKS")
    out = out.replace("Yawp!-rocks", "yawp-rocks")
    out = out.replace("Yawp!.", "Yawp!")
    out = re.sub(r"Yawp!\?(?=[^'s])", "Yawp!", out)
    return out


def process_file(path: Path) -> list[tuple[str, str]]:
    rel = path.relative_to(WEB).as_posix()
    if rel in SKIP_FILES:
        return []
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    changes: list[tuple[str, str]] = []
    new_lines = []
    for line in lines:
        new_line = transform_line(line)
        if new_line != line:
            changes.append((line.strip(), new_line.strip()))
        new_lines.append(new_line)
    if changes:
        path.write_text("".join(new_lines), encoding="utf-8")
    return changes


def main() -> int:
    all_changes: dict[str, list[tuple[str, str]]] = {}
    for pattern in GLOBS:
        for path in WEB.glob(pattern):
            if path.is_file():
                ch = process_file(path)
                if ch:
                    all_changes[str(path.relative_to(ROOT))] = ch
    out_path = Path("/opt/cursor/artifacts/rebrand-yawp-changes.txt")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        for fp, pairs in sorted(all_changes.items()):
            f.write(f"\n## {fp}\n")
            for old, new in pairs[:20]:
                f.write(f"  - {old[:100]}\n    → {new[:100]}\n")
            if len(pairs) > 20:
                f.write(f"  ... +{len(pairs) - 20} more lines\n")
    print(f"Updated {len(all_changes)} files; log at {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
