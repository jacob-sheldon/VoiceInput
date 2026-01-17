const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Building native modules...');

// Create icon first
const iconScript = path.join(__dirname, '../assets/create-icon.js');
if (fs.existsSync(iconScript)) {
  try {
    require(iconScript);
  } catch (error) {
    console.log('Note: Could not create icon (pngjs not installed yet)');
  }
}

try {
  // Check if node-gyp is available
  execSync('which node-gyp', { stdio: 'inherit' });
} catch (error) {
  console.error('node-gyp not found. Please install it first:');
  console.error('  npm install -g node-gyp');
  process.exit(1);
}

// Create build directory
const buildDir = path.join(__dirname, '../build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// Build native modules
try {
  // Read Electron version from package.json
  const pkg = require('../package.json');
  const electronVersion = pkg.devDependencies.electron.replace('^', '');

  // Detect system architecture
  const { arch } = process;
  const nodeGypArch = arch === 'arm64' ? 'arm64' : 'x64';

  console.log(`Building for Electron ${electronVersion} (${nodeGypArch})...`);

  const nodeGypArgs = [
    'rebuild',
    `--target=${electronVersion}`,
    `--arch=${nodeGypArch}`,
    '--dist-url=https://electronjs.org/headers'
  ];

  console.log(`Running: npx node-gyp ${nodeGypArgs.join(' ')}`);
  execSync(`npx node-gyp ${nodeGypArgs.join(' ')}`, {
    cwd: __dirname + '/..',
    stdio: 'inherit'
  });

  console.log('Native modules built successfully!');
} catch (error) {
  console.error('Failed to build native modules:', error.message);
  process.exit(1);
}
