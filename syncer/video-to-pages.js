#!/usr/bin/env node
// airgap syncer: extracts one clean PNG per diff page from a phone video of the looping gif. only external tool: ffmpeg (decodes the phone video).
import {execFileSync} from 'node:child_process'
import {mkdirSync} from 'node:fs'

const argv = process.argv.slice(2)
const flag = (key, dflt, cast = Number) => { const i = argv.indexOf('--' + key); return i < 0 ? dflt : cast(argv.splice(i, 2)[1]) }
const [fps, out, video] = [flag('fps', 8), flag('out', 'syncer/out-pages', String), argv[0]]
if (!video) { console.error('usage: node syncer/video-to-pages.js phone-video.mp4 [--out dir] [--fps 8]'); process.exit(1) }
const ffmpeg = args => { try { return execFileSync('ffmpeg', ['-v', 'error', ...args], {maxBuffer: 1 << 30}) }
  catch (e) { if (e.code === 'ENOENT') { console.error('ffmpeg not found - install it (the only external tool, used to decode the video)'); process.exit(1) } throw e } }

const SW = 48, SH = 27, FRAME = SW * SH * 3
const raw = ffmpeg(['-i', video, '-vf', `fps=${fps},crop=iw/2:ih/2,scale=${SW}:${SH}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])   // classify on center crop
const classify = f => { let r = 0, g = 0, b = 0
  for (let i = f * FRAME; i < (f + 1) * FRAME;) { r += raw[i++]; g += raw[i++]; b += raw[i++] }
  const mean = (r + g + b) / FRAME
  return mean < 45 ? 'dark' : g > 1.3 * r && g > 1.3 * b ? 'green' : r > 1.25 * g && b > 1.25 * g ? 'magenta' : 'page' }
const labels = Array.from({length: Math.floor(raw.length / FRAME)}, (_, f) => classify(f))
const smooth = labels.map((l, i) => labels[i - 1] !== l && labels[i + 1] !== l ? labels[i + 1] ?? l : l)   // a 1-sample blip is camera noise
const runs = smooth.reduce((acc, label, i) => { const prev = acc[acc.length - 1]
  return prev && prev.label === label ? (prev.end = i + 1, acc) : [...acc, {label, start: i, end: i + 1}] }, [])

const magentas = runs.filter(r => r.label === 'magenta' && r.end - r.start >= 2)
const [cycleFrom, cycleTo] = magentas.length >= 2 ? [magentas[0].end, magentas[1].start]
  : magentas.length === 1 ? (runs.some(r => r.label === 'page' && r.start >= magentas[0].end) ? [magentas[0].end, labels.length] : [0, magentas[0].start])
  : [0, labels.length]
if (magentas.length < 2) console.log(`warning: saw the magenta marker ${magentas.length}x - film magenta-to-magenta for a guaranteed complete cycle`)
const pageRuns = runs.filter(r => r.label === 'page' && r.start >= cycleFrom && r.end <= cycleTo && r.end - r.start >= fps)
if (!pageRuns.length) { console.error('no pages detected - is this a recording of the looping diff-sync.gif filling most of the frame?'); process.exit(1) }

mkdirSync(out, {recursive: true})
pageRuns.forEach((r, i) => ffmpeg(['-ss', String((r.start + r.end) / 2 / fps), '-i', video, '-frames:v', '1', '-y', `${out}/page-${String(i + 1).padStart(2, '0')}.png`]))
console.log(`${pageRuns.length} page(s) -> ${out}/page-NN.png  (sampled ${(labels.length / fps).toFixed(1)}s, ${magentas.length} magenta markers)`)
console.log('check the page headers "AIRGAP pX/N": you should have every page 1..N exactly once')
