#!/usr/bin/env node

/**
 * PW-02: Generate PWA favicon files
 *
 * Creates 192x192 and 512x512 PNG files with Astromeda branding.
 * Uses Node.js canvas library if available, falls back to buffer manipulation.
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

// Ensure public directory exists
if (!existsSync(PUBLIC_DIR)) {
  mkdirSync(PUBLIC_DIR, { recursive: true });
}

async function main() {
  console.log('Generating PWA favicon files...');

  try {
    // Try to use canvas library for proper rendering
    const { createCanvas } = await import('canvas');
    generateWithCanvas(createCanvas);
    console.log('✓ Favicons generated with canvas library');
  } catch {
    // Fall back to raw PNG manipulation
    console.log('canvas library not available, generating with PNG buffers...');
    generateWithBuffer();
    console.log('✓ Favicons generated with PNG buffers');
  }
}

function generateWithCanvas(createCanvas) {
  for (const size of [192, 512]) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Astromeda dark background (#06060C)
    ctx.fillStyle = '#06060C';
    ctx.fillRect(0, 0, size, size);

    // Draw cyan "A" letter
    ctx.fillStyle = '#00F0FF';
    ctx.font = `bold ${Math.floor(size * 0.6)}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A', size / 2, size / 2);

    const buffer = canvas.toBuffer('image/png');
    const filepath = join(PUBLIC_DIR, `favicon-${size}.png`);
    writeFileSync(filepath, buffer);
    console.log(`  Created favicon-${size}.png (${buffer.length} bytes)`);
  }
}

function generateWithBuffer() {
  function makePNG(size) {
    // PNG signature
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR chunk (image header)
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(size, 0); // width
    ihdrData.writeUInt32BE(size, 4); // height
    ihdrData[8] = 8; // bit depth
    ihdrData[9] = 2; // color type (RGB)
    ihdrData[10] = 0; // compression method
    ihdrData[11] = 0; // filter method
    ihdrData[12] = 0; // interlace method
    const ihdr = makeChunk('IHDR', ihdrData);

    // Image data: each row has filter byte (0 = no filter) + RGB pixels
    const rowSize = 1 + size * 3;
    const rawData = Buffer.alloc(rowSize * size);

    // Fill with Astromeda colors:
    // Dark background (#06060C) with cyan "A" in center
    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.35; // Size of the "A" circle

    for (let y = 0; y < size; y++) {
      rawData[y * rowSize] = 0; // filter byte for this row
      for (let x = 0; x < size; x++) {
        const offset = y * rowSize + 1 + x * 3;
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

        if (dist < radius) {
          // Cyan center (#00F0FF)
          rawData[offset] = 0x00; // R
          rawData[offset + 1] = 0xf0; // G
          rawData[offset + 2] = 0xff; // B
        } else {
          // Dark background (#06060C)
          rawData[offset] = 0x06; // R
          rawData[offset + 1] = 0x06; // G
          rawData[offset + 2] = 0x0c; // B
        }
      }
    }

    const compressed = zlib.deflateSync(rawData);
    const idat = makeChunk('IDAT', compressed);
    const iend = makeChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdr, idat, iend]);
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeB = Buffer.from(type);
    const crcData = Buffer.concat([typeB, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData), 0);
    return Buffer.concat([len, typeB, data, crc]);
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  for (const size of [192, 512]) {
    const png = makePNG(size);
    const filepath = join(PUBLIC_DIR, `favicon-${size}.png`);
    writeFileSync(filepath, png);
    console.log(`  Created favicon-${size}.png (${png.length} bytes)`);
  }
}

main().catch((err) => {
  console.error('Error generating favicons:', err);
  process.exit(1);
});
