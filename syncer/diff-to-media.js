#!/usr/bin/env node
// airgap syncer: renders a git diff into photographable PNG pages + a looping GIF video. node stdlib only, single self-contained file.
import {execFileSync} from 'node:child_process'
import {deflateSync} from 'node:zlib'
import {writeFileSync, readFileSync, mkdirSync} from 'node:fs'

// 8x8 ascii glyphs 32..126, row bytes with LSB = left pixel, packed from dhepper/font8x8 (public domain)
const FONT = Buffer.from(
  'AAAAAAAAAAAYPDwYGAAYADY2AAAAAAAANjZ/Nn82NgAMPgMeMB8MAABjMxgMZmMAHDYcbjszbgAGBgMAAAAAABgMBgYGDBgABgwYGBgMBgAAZjz/PGYAAAAMDD8MDAAAAAAAAAAMDAYAAAA/AAAAAAAA' +
  'AAAADAwAYDAYDAYDAQA+Y3N7b2c+AAwODAwMDD8AHjMwHAYzPwAeMzAcMDMeADg8NjN/MHgAPwMfMDAzHgAcBgMfMzMeAD8zMBgMDAwAHjMzHjMzHgAeMzM+MBgOAAAMDAAADAwAAAwMAAAMDAYYDAYD' +
  'BgwYAAAAPwAAPwAABgwYMBgMBgAeMzAYDAAMAD5je3t7Ax4ADB4zMz8zMwA/ZmY+ZmY/ADxmAwMDZjwAHzZmZmY2HwB/RhYeFkZ/AH9GFh4WBg8APGYDA3NmfAAzMzM/MzMzAB4MDAwMDB4AeDAwMDMz' +
  'HgBnZjYeNmZnAA8GBgZGZn8AY3d/f2tjYwBjZ297c2NjABw2Y2NjNhwAP2ZmPgYGDwAeMzMzOx44AD9mZj42ZmcAHjMHDjgzHgA/LQwMDAweADMzMzMzMz8AMzMzMzMeDABjY2Nrf3djAGNjNhwcNmMA' +
  'MzMzHgwMHgB/YzEYTGZ/AB4GBgYGBh4AAwYMGDBgQAAeGBgYGBgeAAgcNmMAAAAAAAAAAAAAAP8MDBgAAAAAAAAAHjA+M24ABwYGPmZmOwAAAB4zAzMeADgwMD4zM24AAAAeMz8DHgAcNgYPBgYPAAAA' +
  'bjMzPjAfBwY2bmZmZwAMAA4MDAweADAAMDAwMzMeBwZmNh42ZwAODAwMDAweAAAAM39/a2MAAAAfMzMzMwAAAB4zMzMeAAAAO2ZmPgYPAABuMzM+MHgAADtuZgYPAAAAPgMeMB8ACAw+DAwsGAAAADMz' +
  'MzNuAAAAMzMzHgwAAABja39/NgAAAGM2HDZjAAAAMzMzPjAfAAA/GQwmPwA4DAwHDAw4ABgYGAAYGBgABwwMOAwMBwBuOwAAAAAAAA==', 'base64')

const argv = process.argv.slice(2)
const flag = (key, dflt, cast = Number) => { const i = argv.indexOf('--' + key); return i < 0 ? dflt : cast(argv.splice(i, 2)[1]) }
const [cols, rows, scale, hold, out] = [flag('cols', 96), flag('rows', 54), flag('scale', 2), flag('hold', 2.5), flag('out', 'syncer/out', String)]
const git = args => execFileSync('git', args, {encoding: 'utf8', maxBuffer: 1 << 28})
const tryGit = args => { try { return git(args).trim() } catch { return 'unknown' } }
const diffText = argv[0] === '-' ? readFileSync(0, 'utf8') : git(['diff', '--no-color', ...(argv.length ? argv : ['HEAD'])])
if (!diffText.trim()) { console.error('empty diff - nothing to sync'); process.exit(1) }

const escChar = ch => ch === '\\' ? '\\\\' : ch === '\t' ? '\\t' : ch >= ' ' && ch <= '~' ? ch
  : ch.codePointAt(0) > 0xffff ? `\\u{${ch.codePointAt(0).toString(16)}}` : '\\u' + ch.codePointAt(0).toString(16).padStart(4, '0')
const wrap = line => line.length <= cols ? [line] : [line.slice(0, cols), ...wrap('~' + line.slice(cols))]
const meta = `AIRGAP GIT SYNC | ${new Date().toISOString()} | branch ${tryGit(['rev-parse', '--abbrev-ref', 'HEAD'])} | base ${tryGit(['rev-parse', '--short', 'HEAD'])}`
const rules = 'rules: leading ~ joins to prev line | \\t=tab \\\\=backslash \\uXXXX=unicode | git diff below'
const lines = [...wrap(rules), ...[meta, ...diffText.replace(/\n$/, '').split('\n')].flatMap(line => wrap([...line].map(escChar).join('')))]
const perPage = rows - 2
const pages = Array.from({length: Math.ceil(lines.length / perPage)}, (_, i) => lines.slice(i * perPage, (i + 1) * perPage))

const crc32 = data => { let c = ~0
  for (const byte of Buffer.from(data)) { c ^= byte; for (let i = 8; i--;) c = c >>> 1 ^ (0xEDB88320 & -(c & 1)) }
  return ~c >>> 0 }
const PAD = 24, PITCH = 10, W = cols * 8 * scale + 2 * PAD, H = rows * PITCH * scale + 2 * PAD
const rect = (fb, x, y, w, h, color) => { for (let j = y; j < y + h; j++) fb.fill(color, j * W + x, j * W + x + w) }
const drawText = (fb, row, text, inv = 0) => [...text.padEnd(cols)].slice(0, cols).forEach((ch, i) => {
  const glyph = (Math.min(126, Math.max(32, ch.charCodeAt(0))) - 32) * 8
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++)
    rect(fb, PAD + (i * 8 + x) * scale, PAD + (row * PITCH + y) * scale, scale, scale, FONT[glyph + y] >> x & 1 ^ inv) })
const renderPage = (pageLines, p) => { const fb = new Uint8Array(W * H)
  rect(fb, 8, 8, W - 16, 2, 1); rect(fb, 8, H - 10, W - 16, 2, 1); rect(fb, 8, 8, 2, H - 16, 1); rect(fb, W - 10, 8, 2, H - 16, 1)
  drawText(fb, 0, ` AIRGAP p${p + 1}/${pages.length} crc=${crc32(pageLines.join('\n')).toString(16).padStart(8, '0')}`, 1)
  pageLines.forEach((line, i) => drawText(fb, i + 2, line))
  return fb }

const be32 = n => Buffer.from([n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255])
const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); return Buffer.concat([be32(data.length), body, be32(crc32(body))]) }
const png = fb => { const raw = Buffer.alloc(H * (W + 1))
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) raw[y * (W + 1) + 1 + x] = fb[y * W + x] ? 0 : 255
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', Buffer.concat([be32(W), be32(H), Buffer.from([8, 0, 0, 0, 0])])),
    chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]) }

const le16 = n => [n & 255, n >> 8]
const lzw = pixels => { const bytes = [], dict = new Int16Array(1 << 14)
  let acc = 0, nbits = 0, size = 3, next = 6, cur = pixels[0]
  const emit = code => { acc |= code << nbits; nbits += size; while (nbits >= 8) { bytes.push(acc & 255); acc >>= 8; nbits -= 8 } }
  const reset = () => { dict.fill(-1); size = 3; next = 6 }
  reset(); emit(4)
  const grow = () => { if (next === 1 << size && size < 12) size++ }   // decoder adds entries one code behind the encoder
  for (let i = 1; i < pixels.length; i++) { const key = cur << 2 | pixels[i]
    if (dict[key] >= 0) { cur = dict[key]; continue }
    emit(cur); grow()
    if (next === 4096) { emit(4); reset() } else dict[key] = next++
    cur = pixels[i] }
  emit(cur); grow(); emit(5); if (nbits) bytes.push(acc & 255)
  return bytes }
const subBlocks = bytes => Buffer.concat([...Array.from({length: Math.ceil(bytes.length / 255)},
  (_, i) => Buffer.from([Math.min(255, bytes.length - i * 255), ...bytes.slice(i * 255, i * 255 + 255)])), Buffer.from([0])])
const gifFrame = ([fb, delayCs]) => Buffer.concat([
  Buffer.from([0x21, 0xF9, 4, 4, ...le16(Math.round(delayCs)), 0, 0, 0x2C, 0, 0, 0, 0, ...le16(W), ...le16(H), 0, 2]), subBlocks(lzw(fb))])
const solid = color => new Uint8Array(W * H).fill(color)

const pageFbs = pages.map(renderPage)
const frames = [[solid(3), 150], ...pageFbs.flatMap(fb => [[fb, hold * 100], [solid(2), 60]]).slice(0, -1)]
const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.from([...le16(W), ...le16(H), 0xF1, 0, 0, 255, 255, 255, 0, 0, 0, 0, 255, 0, 255, 0, 255]),
  Buffer.from([0x21, 0xFF, 0x0B, ...Buffer.from('NETSCAPE2.0'), 3, 1, 0, 0, 0]), ...frames.map(gifFrame), Buffer.from([0x3B])])

mkdirSync(out, {recursive: true})
pageFbs.forEach((fb, i) => writeFileSync(`${out}/page-${String(i + 1).padStart(2, '0')}.png`, png(fb)))
writeFileSync(`${out}/diff-sync.gif`, gif)
const cycleSec = (150 + pageFbs.length * hold * 100 + (pageFbs.length - 1) * 60) / 100
console.log(`${pages.length} page(s) -> ${out}/page-NN.png | looping video -> ${out}/diff-sync.gif (${(gif.length / 1e6).toFixed(1)}MB, ${cycleSec.toFixed(1)}s/cycle)`)
console.log('film it fullscreen with your phone: start anytime, keep filming until the magenta flash appears twice')
