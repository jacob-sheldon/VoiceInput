const fs = require('fs');
const path = require('path');

// Create a simple 16x16 PNG icon
const PNG = require('pngjs').PNG;

const png = new PNG({
  width: 16,
  height: 16
});

// Dark background
for (let y = 0; y < 16; y++) {
  for (let x = 0; x < 16; x++) {
    const idx = (y * 16 + x) << 2;
    png.data[idx] = 51;     // R
    png.data[idx + 1] = 51; // G
    png.data[idx + 2] = 51; // B
    png.data[idx + 3] = 255; // A
  }
}

// Simple K letter (white pixels)
const kPixels = [
  // Vertical bar
  [4, 3], [4, 4], [4, 5], [4, 6], [4, 7], [4, 8], [4, 9], [4, 10], [4, 11], [4, 12],
  // Upper diagonal
  [5, 7], [6, 6], [7, 5], [8, 4],
  // Lower diagonal
  [5, 8], [6, 9], [7, 10], [8, 11], [9, 12]
];

kPixels.forEach(([x, y]) => {
  if (x >= 0 && x < 16 && y >= 0 && y < 16) {
    const idx = (y * 16 + x) << 2;
    png.data[idx] = 255;     // R
    png.data[idx + 1] = 255; // G
    png.data[idx + 2] = 255; // B
    png.data[idx + 3] = 255; // A
  }
});

const buffer = PNG.sync.write(png);
const iconPath = path.join(__dirname, 'icon.png');

fs.writeFileSync(iconPath, buffer);
console.log(`Icon created: ${iconPath}`);
