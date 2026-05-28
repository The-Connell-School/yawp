export interface PoetryLine {
  text: string;
  lineNumber: number;
  isStanzaBreak: boolean;
}

export function parsePoetryLines(text: string): PoetryLine[] {
  const rawLines = text.split('\n');
  const lines: PoetryLine[] = [];
  let lineNumber = 1;

  for (const raw of rawLines) {
    if (raw.trim() === '') {
      lines.push({ text: '', lineNumber: 0, isStanzaBreak: true });
    } else {
      lines.push({ text: raw, lineNumber, isStanzaBreak: false });
      lineNumber++;
    }
  }

  return lines;
}
