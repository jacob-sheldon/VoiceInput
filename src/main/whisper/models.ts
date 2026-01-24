import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type WhisperModelId = 'base' | 'small' | 'medium' | 'large-v3';

export interface WhisperModelSpec {
  id: WhisperModelId;
  label: string;
  file: string;
  sizeMB: number;
  description: string;
  qualityRank: number;
}

const MODEL_CATALOG: WhisperModelSpec[] = [
  {
    id: 'base',
    label: 'Base',
    file: 'ggml-base.bin',
    sizeMB: 140,
    description: 'Balanced speed and accuracy.',
    qualityRank: 20
  },
  {
    id: 'small',
    label: 'Small',
    file: 'ggml-small.bin',
    sizeMB: 460,
    description: 'Better accuracy, slower on older Macs.',
    qualityRank: 30
  },
  {
    id: 'medium',
    label: 'Medium',
    file: 'ggml-medium.bin',
    sizeMB: 1400,
    description: 'High accuracy, larger download.',
    qualityRank: 40
  },
  {
    id: 'large-v3',
    label: 'Large v3',
    file: 'ggml-large-v3.bin',
    sizeMB: 2900,
    description: 'Best accuracy available.',
    qualityRank: 60
  }
];

const CAS_BRIDGE_URL = 'https://cas-bridge.xethub.hf.co/ggerganov/whisper.cpp/resolve/main';
const BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';
const MIRROR_URL = 'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main';

export function getModelCatalog(): WhisperModelSpec[] {
  return [...MODEL_CATALOG];
}

export function getModelSpec(modelId: string): WhisperModelSpec | undefined {
  return MODEL_CATALOG.find((model) => model.id === modelId);
}

export function getModelDownloadUrls(modelId: string): string[] {
  const spec = getModelSpec(modelId);
  if (!spec) {
    throw new Error(`Unknown model id: ${modelId}`);
  }

  const envUrls = process.env.KEYBOARDLESS_MODEL_BASE_URLS;
  const baseUrls = envUrls
    ? envUrls.split(',').map((entry) => entry.trim()).filter(Boolean)
    : [CAS_BRIDGE_URL, BASE_URL, MIRROR_URL];

  return baseUrls.map((base) => `${base.replace(/\/$/, '')}/${spec.file}`);
}

export function getModelsDir(): string {
  const overrideDir = process.env.KEYBOARDLESS_MODELS_DIR;
  if (overrideDir && overrideDir.trim().length > 0) {
    return overrideDir;
  }

  try {
    if (app.isReady()) {
      return path.join(app.getPath('userData'), 'models');
    }
  } catch {
    // Ignore and fall back to project directory
  }

  return path.join(process.cwd(), 'models');
}

export function ensureModelsDir(): string {
  const dir = getModelsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getLegacyModelsDir(): string {
  return path.join(process.cwd(), 'models');
}

export function resolveModelPath(modelId: string): string | null {
  const spec = getModelSpec(modelId);
  if (!spec) return null;
  const primaryPath = path.join(getModelsDir(), spec.file);
  if (fs.existsSync(primaryPath)) {
    return primaryPath;
  }
  const legacyPath = path.join(getLegacyModelsDir(), spec.file);
  if (fs.existsSync(legacyPath)) {
    return legacyPath;
  }
  return null;
}

export function listInstalledModelIds(): WhisperModelId[] {
  const installed: WhisperModelId[] = [];
  const modelsDir = getModelsDir();
  const legacyDir = getLegacyModelsDir();
  for (const spec of MODEL_CATALOG) {
    const primaryPath = path.join(modelsDir, spec.file);
    const legacyPath = path.join(legacyDir, spec.file);
    if (fs.existsSync(primaryPath) || fs.existsSync(legacyPath)) {
      installed.push(spec.id);
    }
  }
  return installed;
}

export function getBestInstalledModelId(): WhisperModelId | null {
  const modelsDir = getModelsDir();
  const legacyDir = getLegacyModelsDir();
  const available = MODEL_CATALOG.filter((spec) => {
    return fs.existsSync(path.join(modelsDir, spec.file)) || fs.existsSync(path.join(legacyDir, spec.file));
  });
  if (available.length === 0) {
    return null;
  }
  const sorted = [...available].sort((a, b) => b.qualityRank - a.qualityRank);
  return sorted[0].id;
}
