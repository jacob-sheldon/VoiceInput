const fs = require('fs');
const path = require('path');

// Generate a tray template icon from icon_source.png or fall back to a placeholder icon.
const PNG = require('pngjs').PNG;

const assetsDir = __dirname;
const sourcePath = path.join(assetsDir, 'icon_source.png');
const iconPath = path.join(assetsDir, 'icon.png');
const trayPath = path.join(assetsDir, 'trayTemplate.png');

function createPlaceholderIcon() {
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

  // Simple V letter (white pixels)
  const vPixels = [
    [4, 3], [5, 4], [6, 5], [7, 6],
    [9, 3], [8, 4], [7, 5], [6, 6],
    [7, 7], [7, 8], [7, 9], [7, 10]
  ];

  vPixels.forEach(([x, y]) => {
    if (x >= 0 && x < 16 && y >= 0 && y < 16) {
      const idx = (y * 16 + x) << 2;
      png.data[idx] = 255;     // R
      png.data[idx + 1] = 255; // G
      png.data[idx + 2] = 255; // B
      png.data[idx + 3] = 255; // A
    }
  });

  fs.writeFileSync(iconPath, PNG.sync.write(png));
  console.log(`Placeholder icon created: ${iconPath}`);
}

function createTrayTemplate(sourcePng) {
  const size = 32;
  const tray = new PNG({ width: size, height: size });
  const samples = 4;
  const inkThreshold = 200;
  const coverageThreshold = 0.5;
  const dilateRadius = 0;
  const alphaMap = new Uint8Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inkCount = 0;
      for (let syi = 0; syi < samples; syi++) {
        for (let sxi = 0; sxi < samples; sxi++) {
          const sx = Math.floor(((x + (sxi + 0.5) / samples) * sourcePng.width) / size);
          const sy = Math.floor(((y + (syi + 0.5) / samples) * sourcePng.height) / size);
          const sidx = (sy * sourcePng.width + sx) << 2;
          const r = sourcePng.data[sidx];
          const g = sourcePng.data[sidx + 1];
          const b = sourcePng.data[sidx + 2];
          const brightness = (r + g + b) / 3;
          if (brightness < inkThreshold) {
            inkCount += 1;
          }
        }
      }
      const coverage = inkCount / (samples * samples);
      alphaMap[y * size + x] = coverage >= coverageThreshold ? 255 : 0;
    }
  }

  if (dilateRadius > 0) {
    const dilated = new Uint8Array(alphaMap);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (alphaMap[y * size + x] !== 255) {
          continue;
        }
        for (let dy = -dilateRadius; dy <= dilateRadius; dy++) {
          for (let dx = -dilateRadius; dx <= dilateRadius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
              dilated[ny * size + nx] = 255;
            }
          }
        }
      }
    }
    alphaMap.set(dilated);
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const didx = (y * size + x) << 2;
      tray.data[didx] = 0;
      tray.data[didx + 1] = 0;
      tray.data[didx + 2] = 0;
      tray.data[didx + 3] = alphaMap[y * size + x];
    }
  }

  fs.writeFileSync(trayPath, PNG.sync.write(tray));
  console.log(`Tray template created: ${trayPath}`);
}

if (fs.existsSync(sourcePath)) {
  const sourcePng = PNG.sync.read(fs.readFileSync(sourcePath));
  fs.copyFileSync(sourcePath, iconPath);
  console.log(`Icon synced: ${iconPath}`);
  createTrayTemplate(sourcePng);
} else {
  createPlaceholderIcon();
  console.warn('icon_source.png not found; tray template not generated.');
}
