/**
 * Generates placeholder Tauri icons using only Node.js built-ins (no npm deps).
 * Produces valid PNG files and a PNG-in-ICO (Vista+ format) for Windows bundlers.
 *
 * Run:  node scripts/create-icons.mjs
 *
 * Replace the generated files in src-tauri/icons/ with your real icons before
 * shipping. Any committed icon files are left untouched by the CI workflow.
 */

import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconsDir = join(root, 'src-tauri', 'icons')
mkdirSync(iconsDir, { recursive: true })

// ── CRC-32 ────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// ── PNG builder ───────────────────────────────────────────────────────────────

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.allocUnsafe(4)
  len.writeUInt32BE(data.length)
  const crcBuf = Buffer.allocUnsafe(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crcBuf])
}

/**
 * Creates a solid-colour PNG (8-bit RGB, no alpha).
 * @param {number} size - Width and height in pixels
 * @param {[number,number,number]} rgb - Colour as [r, g, b]
 */
function makePNG(size, [r, g, b]) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 2   // colour type: RGB
  ihdr[10] = ihdr[11] = ihdr[12] = 0

  // One row: filter byte (None=0) + RGB pixels
  const row = Buffer.allocUnsafe(1 + size * 3)
  row[0] = 0
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = r
    row[2 + x * 3] = g
    row[3 + x * 3] = b
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  const idat = deflateSync(raw, { level: 9 })

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ── ICO builder (PNG-in-ICO, Windows Vista+) ──────────────────────────────────

/**
 * Wraps a PNG buffer in a single-image ICO container.
 * @param {Buffer} png
 * @param {number} size - Pixel dimension of the image
 */
function pngToICO(png, size) {
  const header = Buffer.allocUnsafe(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: 1 = icon
  header.writeUInt16LE(1, 4) // image count

  const entry = Buffer.allocUnsafe(16)
  entry[0] = size >= 256 ? 0 : size // 0 encodes as 256
  entry[1] = size >= 256 ? 0 : size
  entry[2] = 0 // colour count (0 = no palette)
  entry[3] = 0 // reserved
  entry.writeUInt16LE(1, 4)             // planes
  entry.writeUInt16LE(32, 6)            // bits per pixel
  entry.writeUInt32LE(png.length, 8)    // data size
  entry.writeUInt32LE(22, 12)           // data offset (6 header + 16 entry)

  return Buffer.concat([header, entry, png])
}

// ── Generate ──────────────────────────────────────────────────────────────────

// App brand colours (matches the UI theme)
const TEAL = [78, 205, 196] // #4ecdc4

const files = {
  '32x32.png':       makePNG(32, TEAL),
  '128x128.png':     makePNG(128, TEAL),
  '128x128@2x.png':  makePNG(256, TEAL),
  'icon.ico':        pngToICO(makePNG(256, TEAL), 256),
}

let written = 0
for (const [name, buf] of Object.entries(files)) {
  const dest = join(iconsDir, name)
  if (existsSync(dest)) {
    console.log(`  skip  ${name}  (already exists)`)
  } else {
    writeFileSync(dest, buf)
    console.log(`  wrote ${name}  (${buf.length} bytes)`)
    written++
  }
}

console.log(written ? `\nDone — ${written} icon(s) written to src-tauri/icons/` : '\nAll icons already present, nothing to do.')
