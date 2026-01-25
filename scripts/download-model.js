const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

function getModelsDir() {
  if (process.env.VOIX_MODELS_DIR) {
    return process.env.VOIX_MODELS_DIR;
  }

  if (process.platform === 'darwin') {
    const home = process.env.HOME || process.env.USERPROFILE;
    if (home) {
      return path.join(home, 'Library', 'Application Support', 'Voix', 'models');
    }
  }

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || process.env.LOCALAPPDATA;
    if (appData) {
      return path.join(appData, 'Voix', 'models');
    }
  }

  return path.join(__dirname, '../models');
}

const modelsDir = getModelsDir();
const baseUrl = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

const models = {
  base: 'ggml-base.bin',
  small: 'ggml-small.bin',
  medium: 'ggml-medium.bin',
  'large-v3': 'ggml-large-v3.bin',
  large_v3: 'ggml-large-v3.bin'
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);

    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        downloadFile(response.headers.location, dest)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
        process.stdout.write(`\rProgress: ${progress}%`);
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log('\nDownload complete!');
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

async function main() {
  const model = process.argv[2] || 'small';

  if (!models[model]) {
    console.error(`Invalid model: ${model}`);
    console.log(`Available models: ${Object.keys(models).join(', ')}`);
    process.exit(1);
  }

  const modelFile = models[model];
  const modelPath = path.join(modelsDir, modelFile);

  ensureDir(modelsDir);

  if (fs.existsSync(modelPath)) {
    console.log(`Model already exists: ${modelPath}`);
    return;
  }

  const url = `${baseUrl}/${modelFile}`;

  try {
    await downloadFile(url, modelPath);
    console.log(`Model saved to: ${modelPath}`);
  } catch (error) {
    console.error('Failed to download model:', error.message);
    console.log('\nYou can download it manually:');
    console.log(`  mkdir -p ${modelsDir}`);
    console.log(`  curl -L ${url} -o ${modelPath}`);
    process.exit(1);
  }
}

main();
