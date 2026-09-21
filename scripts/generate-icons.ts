import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c;
  }
  return table;
}

const crcTable = createCrcTable();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type: string, data: Buffer): Buffer {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function generatePng(width: number, height: number, isMaskable = false): Buffer {
  // Raw scanlines: width * 4 (RGBA) + 1 filter byte per line
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  const cx = width / 2;
  const cy = height / 2;
  const radius = isMaskable ? width * 0.5 : width * 0.44;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Deep Navy background: #16324F (22, 50, 79)
      let r = 22;
      let g = 50;
      let b = 79;
      let a = 255;

      // Outer shape rounding if not maskable
      if (!isMaskable) {
        const cornerDist = Math.max(Math.abs(dx), Math.abs(dy));
        const roundRadius = width * 0.22;
        // Rounded box shape
        const qx = Math.max(0, Math.abs(dx) - (cx - roundRadius));
        const qy = Math.max(0, Math.abs(dy) - (cy - roundRadius));
        const qDist = Math.sqrt(qx * qx + qy * qy);
        if (qDist > roundRadius) {
          a = 0;
        }
      }

      if (a > 0) {
        // Draw icon elements in the center
        // Center circle badge with golden border
        const badgeRadius = isMaskable ? width * 0.28 : width * 0.32;
        if (dist <= badgeRadius) {
          // Inner circle gradient
          const t = dist / badgeRadius;
          // Amber/Golden glow: #D97706 to #F59E0B
          if (dist > badgeRadius - Math.max(2, width * 0.025)) {
            // Gold border
            r = 245; g = 158; b = 11;
          } else {
            // Inner rich navy
            r = 29; g = 78; b = 137;
          }
        }

        // Draw central "R" emblem or Delivery Truck / Bottle motif
        // Simple stylized geometry:
        // Horizontal bar (truck base / banner)
        const scale = width / 192;
        const inHBar = Math.abs(dy - 4 * scale) <= 6 * scale && Math.abs(dx) <= 28 * scale;
        const inStem = dx >= -18 * scale && dx <= -8 * scale && dy >= -26 * scale && dy <= 24 * scale;
        const inTopLoop = dx >= -12 * scale && dx <= 16 * scale && dy >= -26 * scale && dy <= -2 * scale;
        const inTopHole = dx >= -4 * scale && dx <= 8 * scale && dy >= -20 * scale && dy <= -8 * scale;
        const inLeg = dx >= -2 * scale && dx <= 18 * scale && dy >= -2 * scale && dy <= 24 * scale && Math.abs((dy + 2 * scale) - (dx + 2 * scale) * 1.3) <= 8 * scale;

        if (inStem || (inTopLoop && !inTopHole) || inLeg) {
          // Warm gold / cream
          r = 254; g = 243; b = 199;
        }

        // Top sparkle / star
        const sx = dx - 18 * scale;
        const sy = dy + 22 * scale;
        if (Math.abs(sx) + Math.abs(sy) <= 6 * scale) {
          r = 251; g = 191; b = 36;
        }
      }

      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  // PNG Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: 6 (RGBA)
  ihdrData[10] = 0; // Compression method: 0
  ihdrData[11] = 0; // Filter method: 0
  ihdrData[12] = 0; // Interlace method: 0
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);

  // IEND
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.resolve(process.cwd(), 'public');

console.log('Generating PWA icons...');

// 1. 192x192
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), generatePng(192, 192, false));
console.log('Created pwa-192x192.png');

// 2. 512x512
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), generatePng(512, 512, false));
console.log('Created pwa-512x512.png');

// 3. Maskable 512x512
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), generatePng(512, 512, true));
console.log('Created pwa-maskable-512x512.png');

// 4. Apple Touch Icon 180x180
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), generatePng(180, 180, false));
console.log('Created apple-touch-icon.png');

// 5. Favicon 64x64
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), generatePng(64, 64, false));
console.log('Created favicon.ico');

console.log('All PWA and mobile icons generated successfully.');
