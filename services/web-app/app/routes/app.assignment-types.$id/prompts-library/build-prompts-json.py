#!/usr/bin/env python3
"""Build prompts.json from the freewrite prompts library xlsx.

Usage:
    python3 build-prompts-json.py <path-to-xlsx>

Writes prompts.json next to this script.
Requires openpyxl: pip install openpyxl
"""
import sys
import os
import re
import json
import datetime

try:
    import openpyxl  # type: ignore
except ImportError:
    sys.exit('openpyxl is required: pip install openpyxl')

# Common mojibake — Windows-1252 bytes that got re-decoded as UTF-8.
MOJIBAKE_FIXES = {
    'â€”': '—',  # em-dash
    'â€“': '–',  # en-dash
    'â€™': '’',  # right single quote
    'â€˜': '‘',  # left single quote
    'â€œ': '“',  # left double quote
    'â€\x9d': '”',   # right double quote
    'â€¦': '…', # ellipsis
}


def fix_str(s):
    if not isinstance(s, str):
        return s
    for k, v in MOJIBAKE_FIXES.items():
        s = s.replace(k, v)
    return s


def to_str(v):
    if v is None:
        return ''
    return v if isinstance(v, str) else str(v)


def split_comma(v):
    return [x.strip() for x in re.split(r',', to_str(v)) if x.strip()]


def split_semi(v):
    return [x.strip() for x in re.split(r';', to_str(v)) if x.strip()]


def parse_grades(v):
    """Recover grade bands from cells Excel auto-converted to dates.
    e.g. "10, 11, 12" → datetime(2012, 10, 11) → [10, 11, 12].
    """
    if isinstance(v, datetime.datetime):
        nums = [v.month, v.day, v.year % 100]
        return [str(n) for n in nums if 9 <= n <= 12]
    return split_comma(v)


def main():
    if len(sys.argv) != 2:
        sys.exit('usage: build-prompts-json.py <xlsx>')
    src = sys.argv[1]
    wb = openpyxl.load_workbook(src, data_only=True)
    ws = wb['Prompts']
    prompts = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row[0]:
            continue
        pid, text, themes, texts, ser, ptype, moves, grades, *_ = row
        prompts.append({
            'id': pid,
            'prompt': fix_str(text),
            'themes': split_comma(themes),
            'textsOrUnits': split_semi(texts),
            'seriousness': ser,
            'type': ptype,
            'cognitiveMoves': split_comma(moves),
            'gradeBands': parse_grades(grades),
        })
    out = os.path.join(os.path.dirname(__file__), 'prompts.json')
    with open(out, 'w', encoding='utf-8') as f:
        f.write('[\n')
        for i, p in enumerate(prompts):
            f.write('  ' + json.dumps(p, ensure_ascii=False))
            f.write(',\n' if i < len(prompts) - 1 else '\n')
        f.write(']\n')
    print(f'Wrote {len(prompts)} prompts to {out}')


if __name__ == '__main__':
    main()
