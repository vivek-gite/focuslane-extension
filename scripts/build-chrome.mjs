import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist", "chrome");
const chromeManifestPath = path.join(rootDir, "manifests", "chrome.json");

const sharedFiles = [
  "background.js",
  "content.js",
  "popup.html",
  "popup.js"
];

const pngIconSizes = [16, 32, 48, 128];

async function copyFile(relativePath) {
  const source = path.join(rootDir, relativePath);
  const target = path.join(distDir, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function copyDirectory(sourceDir, targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;

    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(source, target);
    } else if (entry.isFile()) {
      await fs.copyFile(source, target);
    }
  }
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const rowLength = width * 4 + 1;
  const rows = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowLength;
    rows[rowStart] = 0;
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(rows, rowStart + 1);
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(rows)),
    pngChunk("IEND")
  ]);
}

function fill(buffer, width, height, color) {
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    buffer[offset] = color[0];
    buffer[offset + 1] = color[1];
    buffer[offset + 2] = color[2];
    buffer[offset + 3] = color[3];
  }
}

function drawRect(buffer, width, height, x, y, rectWidth, rectHeight, color) {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(width, Math.ceil(x + rectWidth));
  const endY = Math.min(height, Math.ceil(y + rectHeight));

  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) {
      const offset = (py * width + px) * 4;
      buffer[offset] = color[0];
      buffer[offset + 1] = color[1];
      buffer[offset + 2] = color[2];
      buffer[offset + 3] = color[3];
    }
  }
}

function downsample(source, sourceWidth, sourceHeight, factor) {
  const width = sourceWidth / factor;
  const height = sourceHeight / factor;
  const target = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sum = [0, 0, 0, 0];
      for (let fy = 0; fy < factor; fy += 1) {
        for (let fx = 0; fx < factor; fx += 1) {
          const sourceOffset = ((y * factor + fy) * sourceWidth + (x * factor + fx)) * 4;
          sum[0] += source[sourceOffset];
          sum[1] += source[sourceOffset + 1];
          sum[2] += source[sourceOffset + 2];
          sum[3] += source[sourceOffset + 3];
        }
      }

      const targetOffset = (y * width + x) * 4;
      const sampleCount = factor * factor;
      target[targetOffset] = Math.round(sum[0] / sampleCount);
      target[targetOffset + 1] = Math.round(sum[1] / sampleCount);
      target[targetOffset + 2] = Math.round(sum[2] / sampleCount);
      target[targetOffset + 3] = Math.round(sum[3] / sampleCount);
    }
  }

  return target;
}

function createIcon(size) {
  const factor = 4;
  const width = size * factor;
  const height = size * factor;
  const pixels = new Uint8Array(width * height * 4);
  const scale = width / 1024;
  const bg = [238, 247, 240, 255];
  const mark = [0, 0, 0, 255];

  fill(pixels, width, height, bg);

  const rect = (x, y, w, h) => drawRect(
    pixels,
    width,
    height,
    x * scale,
    y * scale,
    w * scale,
    h * scale,
    mark
  );

  rect(224, 320, 508, 95);
  rect(396, 320, 134, 357);
  rect(396, 476, 336, 95);
  rect(224, 571, 306, 106);

  return encodePng(size, size, downsample(pixels, width, height, factor));
}

async function writeChromeIcons() {
  const iconsDir = path.join(distDir, "icons");
  await fs.mkdir(iconsDir, { recursive: true });

  for (const size of pngIconSizes) {
    await fs.writeFile(path.join(iconsDir, `icon${size}.png`), createIcon(size));
  }
}

function collectManifestIconPaths(manifest) {
  const iconPaths = new Set(Object.values(manifest.icons || {}));
  for (const iconPath of Object.values(manifest.action?.default_icon || {})) {
    iconPaths.add(iconPath);
  }
  return [...iconPaths];
}

async function validateChromeManifest(manifest) {
  if (manifest.manifest_version !== 3) {
    throw new Error("Chrome manifest must use manifest_version 3.");
  }
  if (manifest.browser_action) {
    throw new Error("Chrome manifest must use action instead of browser_action.");
  }
  if (manifest.browser_specific_settings) {
    throw new Error("Chrome manifest must not include Firefox browser_specific_settings.");
  }
  if (!manifest.background?.service_worker) {
    throw new Error("Chrome manifest must declare a background service_worker.");
  }
  if (!manifest.permissions?.includes("declarativeNetRequestWithHostAccess")) {
    throw new Error("Chrome manifest must include declarativeNetRequestWithHostAccess.");
  }

  for (const iconPath of collectManifestIconPaths(manifest)) {
    if (path.extname(iconPath).toLowerCase() === ".svg") {
      throw new Error(`Chrome manifest icon must not be SVG: ${iconPath}`);
    }
    await fs.access(path.join(distDir, iconPath));
  }

  for (const file of sharedFiles) {
    await fs.access(path.join(distDir, file));
  }
}

async function main() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });

  for (const file of sharedFiles) {
    await copyFile(file);
  }

  await copyDirectory(path.join(rootDir, "icons"), path.join(distDir, "icons"));
  await writeChromeIcons();

  const manifest = JSON.parse(await fs.readFile(chromeManifestPath, "utf8"));
  await fs.writeFile(
    path.join(distDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  await validateChromeManifest(manifest);

  console.log(`Chrome extension written to ${path.relative(rootDir, distDir)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
