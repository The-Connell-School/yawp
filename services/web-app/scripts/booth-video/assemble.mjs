/**
 * Joins the recorded clips into the booth video: half-second cross-fades,
 * 1920×1080 H.264 at 30 fps, yuv420p, with a silent stereo track (some TV USB
 * players won't start a file that has no audio) and +faststart.
 *
 *   node scripts/booth-video/assemble.mjs --clips <dir> --out yawp-ncte-booth.mp4
 *
 * Clips are joined in filename order (record.mjs numbers them). The file starts
 * on the opening card and ends on the closing card, so it loops cleanly.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i === -1 ? undefined : args[i + 1]; };
const clipsDir = opt('clips');
const out = opt('out') ?? 'yawp-ncte-booth.mp4';
const fade = Number(opt('fade') ?? 0.5);
if (!clipsDir) throw new Error('--clips <dir> is required');

const clips = fs.readdirSync(clipsDir).filter((f) => /^\d+-.*\.mp4$/.test(f)).sort().map((f) => path.join(clipsDir, f));
const duration = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());
const durations = clips.map(duration);

const inputs = clips.flatMap((file) => ['-i', file]);
const filters = clips.map((_, i) => `[${i}:v]fps=30,scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p,settb=AVTB[v${i}]`);
let last = 'v0';
let length = durations[0];
for (let i = 1; i < clips.length; i += 1) {
  const label = i === clips.length - 1 ? 'vout' : `x${i}`;
  filters.push(`[${last}][v${i}]xfade=transition=fade:duration=${fade}:offset=${(length - fade).toFixed(3)}[${label}]`);
  last = label;
  length += durations[i] - fade;
}
if (clips.length === 1) filters.push('[v0]null[vout]');

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error',
  ...inputs,
  '-f', 'lavfi', '-t', length.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
  '-filter_complex', filters.join(';'),
  '-map', '[vout]', '-map', `${clips.length}:a`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-level', '4.1',
  '-pix_fmt', 'yuv420p', '-r', '30', '-g', '60',
  '-c:a', 'aac', '-b:a', '64k',
  '-shortest', '-movflags', '+faststart',
  out,
], { stdio: 'inherit' });

console.log(JSON.stringify({ out, clips: clips.length, seconds: Number(length.toFixed(1)), bytes: fs.statSync(out).size }));
