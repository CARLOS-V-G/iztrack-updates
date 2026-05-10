const fs = require("node:fs");
const path = require("node:path");

const outDir = path.join(__dirname, "build");
fs.mkdirSync(outDir, { recursive: true });

function createCanvas(width, height) {
  return {
    width,
    height,
    data: new Uint8Array(width * height * 3),
  };
}

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function mixColor(from, to, t) {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

function setPixel(canvas, x, y, color, alpha = 1) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const index = (y * canvas.width + x) * 3;
  const inverse = 1 - alpha;
  canvas.data[index] = clamp(canvas.data[index] * inverse + color[0] * alpha);
  canvas.data[index + 1] = clamp(canvas.data[index + 1] * inverse + color[1] * alpha);
  canvas.data[index + 2] = clamp(canvas.data[index + 2] * inverse + color[2] * alpha);
}

function fillGradient(canvas, top, bottom) {
  for (let y = 0; y < canvas.height; y += 1) {
    const t = y / Math.max(1, canvas.height - 1);
    const color = mixColor(top, bottom, t);
    for (let x = 0; x < canvas.width; x += 1) {
      setPixel(canvas, x, y, color);
    }
  }
}

function fillRect(canvas, x, y, width, height, color, alpha = 1) {
  x = Math.round(x);
  y = Math.round(y);
  width = Math.round(width);
  height = Math.round(height);
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      setPixel(canvas, px, py, color, alpha);
    }
  }
}

function fillRoundedRect(canvas, x, y, width, height, radius, color, alpha = 1) {
  x = Math.round(x);
  y = Math.round(y);
  width = Math.round(width);
  height = Math.round(height);
  radius = Math.round(radius);
  const right = x + width - 1;
  const bottom = y + height - 1;
  const radiusSquared = radius * radius;

  for (let py = y; py <= bottom; py += 1) {
    for (let px = x; px <= right; px += 1) {
      let cx = px;
      let cy = py;
      if (px < x + radius) cx = x + radius;
      if (px > right - radius) cx = right - radius;
      if (py < y + radius) cy = y + radius;
      if (py > bottom - radius) cy = bottom - radius;
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= radiusSquared) {
        setPixel(canvas, px, py, color, alpha);
      }
    }
  }
}

function addGlow(canvas, cx, cy, radius, color, intensity) {
  const radiusSquared = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > radiusSquared) continue;
      const falloff = 1 - Math.sqrt(distanceSquared) / radius;
      setPixel(canvas, x, y, color, falloff * intensity);
    }
  }
}

function addDiagonalTexture(canvas) {
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if ((x + y * 2) % 42 < 2) {
        setPixel(canvas, x, y, [255, 255, 255], 0.045);
      }
    }
  }
}

function drawLogoMark(canvas, x, y, size, accent = [37, 99, 235]) {
  fillRoundedRect(canvas, x, y, size, size, Math.round(size * 0.22), [239, 246, 255], 1);
  fillRoundedRect(canvas, x + size * 0.18, y + size * 0.2, size * 0.64, size * 0.6, Math.round(size * 0.14), accent, 1);

  const barTop = Math.round(y + size * 0.34);
  const barHeight = Math.round(size * 0.32);
  const left = Math.round(x + size * 0.29);
  const bars = [2, 1, 3, 1, 2, 1, 2];
  let currentX = left;
  for (const barWidth of bars) {
    fillRect(canvas, currentX, barTop, Math.max(1, Math.round(barWidth * size * 0.018)), barHeight, [255, 255, 255], 0.95);
    currentX += Math.round(size * 0.075);
  }
}

const FONT = {
  i: ["1", "0", "1", "1", "1", "1", "1"],
  z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  r: ["1110", "1001", "1000", "1000", "1000", "1000", "1000"],
  a: ["01110", "00001", "01111", "10001", "10001", "10011", "01101"],
  c: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  k: ["1001", "1010", "1100", "1100", "1010", "1001", "1001"],
  " ": ["0", "0", "0", "0", "0", "0", "0"],
};

function drawText(canvas, x, y, text, scale, color, alpha = 1) {
  let cursorX = x;
  for (const char of text) {
    const pattern = FONT[char] || FONT[" "];
    for (let row = 0; row < pattern.length; row += 1) {
      for (let col = 0; col < pattern[row].length; col += 1) {
        if (pattern[row][col] !== "1") continue;
        fillRect(canvas, cursorX + col * scale, y + row * scale, scale, scale, color, alpha);
      }
    }
    cursorX += (pattern[0].length + 1) * scale;
  }
}

function writeBmp(canvas, filePath) {
  const rowSize = Math.ceil((canvas.width * 3) / 4) * 4;
  const pixelDataSize = rowSize * canvas.height;
  const fileSize = 54 + pixelDataSize;
  const buffer = Buffer.alloc(fileSize);

  buffer.write("BM", 0, "ascii");
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(canvas.width, 18);
  buffer.writeInt32LE(canvas.height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(0, 30);
  buffer.writeUInt32LE(pixelDataSize, 34);
  buffer.writeInt32LE(2835, 38);
  buffer.writeInt32LE(2835, 42);

  for (let y = 0; y < canvas.height; y += 1) {
    const sourceY = canvas.height - 1 - y;
    for (let x = 0; x < canvas.width; x += 1) {
      const sourceIndex = (sourceY * canvas.width + x) * 3;
      const targetIndex = 54 + y * rowSize + x * 3;
      buffer[targetIndex] = canvas.data[sourceIndex + 2];
      buffer[targetIndex + 1] = canvas.data[sourceIndex + 1];
      buffer[targetIndex + 2] = canvas.data[sourceIndex];
    }
  }

  fs.writeFileSync(filePath, buffer);
}

function createSidebar() {
  const canvas = createCanvas(164, 314);
  fillGradient(canvas, [8, 18, 38], [2, 6, 20]);
  addGlow(canvas, 146, 40, 88, [37, 99, 235], 0.6);
  addGlow(canvas, 26, 268, 72, [14, 165, 233], 0.35);
  addDiagonalTexture(canvas);

  fillRoundedRect(canvas, 18, 24, 58, 58, 14, [15, 23, 42], 0.75);
  drawLogoMark(canvas, 23, 29, 48);
  drawText(canvas, 22, 104, "izTrack", 3, [245, 249, 255], 0.98);

  fillRoundedRect(canvas, 22, 151, 86, 3, 2, [37, 99, 235], 1);
  fillRoundedRect(canvas, 22, 162, 120, 2, 1, [96, 165, 250], 0.75);
  fillRoundedRect(canvas, 22, 171, 105, 2, 1, [96, 165, 250], 0.45);

  for (let i = 0; i < 7; i += 1) {
    const height = 18 + (i % 3) * 9;
    fillRoundedRect(canvas, 34 + i * 14, 248 - height, 6, height, 3, [59, 130, 246], 0.9);
  }

  fillRoundedRect(canvas, 20, 276, 124, 1, 1, [148, 163, 184], 0.45);
  fillRoundedRect(canvas, 20, 288, 82, 2, 1, [226, 232, 240], 0.75);
  fillRoundedRect(canvas, 20, 297, 104, 2, 1, [96, 165, 250], 0.55);

  return canvas;
}

function createHeader() {
  const canvas = createCanvas(150, 57);
  fillGradient(canvas, [249, 250, 252], [232, 240, 254]);
  addGlow(canvas, 130, 18, 55, [37, 99, 235], 0.32);
  fillRoundedRect(canvas, 0, 52, 150, 5, 0, [37, 99, 235], 1);
  drawLogoMark(canvas, 9, 10, 34, [37, 99, 235]);
  drawText(canvas, 52, 17, "izTrack", 2, [15, 23, 42], 1);
  fillRoundedRect(canvas, 52, 39, 72, 2, 1, [37, 99, 235], 0.9);
  return canvas;
}

writeBmp(createSidebar(), path.join(outDir, "installerSidebar.bmp"));
writeBmp(createHeader(), path.join(outDir, "installerHeader.bmp"));

console.log("Installer assets generated in build/");
