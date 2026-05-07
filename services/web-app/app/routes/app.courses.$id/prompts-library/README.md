# Prompts Library data

`prompts.json` is the canonical corpus consumed by the Daily Pages prompts library. The route loader imports it directly.

## Updating the corpus

The authoring source is the Free Write Prompts Library spreadsheet (xlsx, lives outside this repo per the spec). After editing the sheet, regenerate `prompts.json`:

```bash
python3 build-prompts-json.py /path/to/freewrite_prompts_library.xlsx
```

Requires `openpyxl` (`pip install openpyxl`).

The script handles two known quirks of the source sheet: Excel auto-converting comma-separated grade bands like `10, 11, 12` into dates, and common mojibake patterns in em-dashes / smart quotes.

## Schema

| field | shape |
|---|---|
| `id` | `FW-NNN` |
| `prompt` | string |
| `themes` | string[] (controlled vocabulary) |
| `textsOrUnits` | string[] (literary works + writing units) |
| `seriousness` | `playful` \| `light` \| `moderate` \| `serious` \| `heavy` |
| `type` | `agree-disagree` \| `open-reflection` \| `narrative-anchor` \| `hypothetical` \| `provocation` \| `definitional` |
| `cognitiveMoves` | string[] |
| `gradeBands` | subset of `9` \| `10` \| `11` \| `12` |
