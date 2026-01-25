import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import {
  WhisperModelSpec,
  WhisperModelId,
  getModelCatalog,
  getModelDownloadUrls,
  getModelSpec,
  ensureModelsDir,
  getModelsDir,
  getBestInstalledModelId,
  getLegacyModelsDir
} from './models';

export interface ModelState extends WhisperModelSpec {
  installed: boolean;
  sizeBytes?: number;
  path: string;
}

export interface DownloadProgress {
  modelId: WhisperModelId;
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
}

export class ModelManager {
  private activeDownloads = new Map<WhisperModelId, Promise<void>>();
  private readonly logPrefix = '[model]';
  private readonly connectTimeoutMs: number = (() => {
    const raw = process.env.VOIX_MODEL_CONNECT_TIMEOUT_MS;
    if (!raw) return 6000;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 6000;
  })();
  private readonly probeTimeoutMs: number = (() => {
    const raw = process.env.VOIX_MODEL_PROBE_TIMEOUT_MS;
    if (!raw) return 2000;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 2000;
  })();
  private readonly probeMaxWaitMs: number = (() => {
    const raw = process.env.VOIX_MODEL_PROBE_MAX_WAIT_MS;
    if (!raw) return 1200;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1200;
  })();
  private readonly fallbackHostOrder: string[] = (() => {
    const raw = process.env.VOIX_MODEL_FALLBACK_HOSTS;
    if (raw) {
      return raw.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
    return ['hf-mirror.com', 'cas-bridge.xethub.hf.co', 'huggingface.co'];
  })();
  private readonly probeBytes: number = (() => {
    const raw = process.env.VOIX_MODEL_PROBE_BYTES;
    if (!raw) return 256 * 1024;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 256 * 1024;
  })();

  listModels(): ModelState[] {
    const modelsDir = getModelsDir();
    const legacyDir = getLegacyModelsDir();
    const catalog = getModelCatalog();
    const entries = catalog.map((spec) => {
      const modelPath = path.join(modelsDir, spec.file);
      const legacyPath = path.join(legacyDir, spec.file);
      let sizeBytes: number | undefined;
      let installed = false;
      if (fs.existsSync(modelPath) || fs.existsSync(legacyPath)) {
        installed = true;
        try {
          const statPath = fs.existsSync(modelPath) ? modelPath : legacyPath;
          sizeBytes = fs.statSync(statPath).size;
        } catch {
          sizeBytes = undefined;
        }
      }
      return {
        ...spec,
        installed,
        sizeBytes,
        path: fs.existsSync(modelPath) ? modelPath : legacyPath
      };
    });

    return entries.sort((a, b) => b.qualityRank - a.qualityRank);
  }

  getBestModelId(): WhisperModelId | null {
    return getBestInstalledModelId();
  }

  getModelDirectories(): { primary: string; legacy: string | null } {
    const primary = getModelsDir();
    const legacy = getLegacyModelsDir();
    return {
      primary,
      legacy: fs.existsSync(legacy) ? legacy : null
    };
  }

  async downloadModel(modelId: string, onProgress?: (progress: DownloadProgress) => void): Promise<void> {
    const spec = getModelSpec(modelId);
    if (!spec) {
      throw new Error(`Unknown model id: ${modelId}`);
    }

    const resolvedId = spec.id;
    const existing = this.activeDownloads.get(resolvedId);
    if (existing) {
      return existing;
    }

    ensureModelsDir();
    const modelsDir = getModelsDir();
    const finalPath = path.join(modelsDir, spec.file);
    if (fs.existsSync(finalPath)) {
      console.log(`${this.logPrefix} already installed: ${spec.id} -> ${finalPath}`);
      return;
    }

    const tempPath = `${finalPath}.partial`;
    console.log(`${this.logPrefix} start download: ${spec.id} -> ${finalPath}`);
    const downloadPromise = this.downloadWithFallbacks(getModelDownloadUrls(resolvedId), tempPath, resolvedId, onProgress)
      .then(() => {
        if (fs.existsSync(finalPath)) {
          fs.unlinkSync(finalPath);
        }
        fs.renameSync(tempPath, finalPath);
        console.log(`${this.logPrefix} download complete: ${spec.id}`);
      })
      .catch((error) => {
        console.error(`${this.logPrefix} download failed: ${spec.id}`, error);
        try {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        } catch {
          // Ignore cleanup errors
        }
        throw error;
      })
      .finally(() => {
        this.activeDownloads.delete(resolvedId);
      });

    this.activeDownloads.set(resolvedId, downloadPromise);
    return downloadPromise;
  }

  deleteModel(modelId: string): void {
    const spec = getModelSpec(modelId);
    if (!spec) {
      throw new Error(`Unknown model id: ${modelId}`);
    }
    const modelPath = path.join(getModelsDir(), spec.file);
    if (fs.existsSync(modelPath)) {
      fs.unlinkSync(modelPath);
    }
  }

  private async downloadWithFallbacks(
    urls: string[],
    destPath: string,
    modelId: WhisperModelId,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    let lastError: unknown = null;

    const orderedUrls = await this.probeAndOrderUrls(urls);

    for (let index = 0; index < orderedUrls.length; index += 1) {
      const url = orderedUrls[index];
      try {
        console.log(`${this.logPrefix} attempt ${index + 1}/${orderedUrls.length}: ${url}`);
        await this.downloadToFile(url, destPath, modelId, onProgress);
        return;
      } catch (error: any) {
        lastError = error;
        const code = error?.code as string | undefined;
        const statusCode = error?.statusCode as number | undefined;
        const started = Boolean(error?.downloadStarted);
        const retryableCodes = new Set(['ETIMEDOUT', 'ENETUNREACH', 'EAI_AGAIN']);
        const retryableStatus = statusCode !== undefined && (statusCode === 403 || statusCode === 404 || statusCode === 429 || statusCode >= 500);
        if (!started && code && retryableCodes.has(code)) {
          console.warn(`${this.logPrefix} retrying with next source due to ${code}`);
          continue;
        }
        if (!started && retryableStatus) {
          console.warn(`${this.logPrefix} retrying with next source due to status ${statusCode}`);
          continue;
        }
        throw error;
      }
    }

    throw lastError ?? new Error('Failed to download model');
  }

  private async probeAndOrderUrls(urls: string[]): Promise<string[]> {
    if (urls.length <= 1) {
      return urls;
    }

    if (process.env.VOIX_MODEL_SKIP_PROBE === '1') {
      return urls;
    }

    console.log(
      `${this.logPrefix} probe start (${urls.length} sources, ${this.probeBytes} bytes max, ${this.probeTimeoutMs}ms timeout, ${this.probeMaxWaitMs}ms max wait)`
    );

    const results: Array<{ url: string; ok: boolean; score: number; reason?: string | number }> = [];
    let completed = 0;
    let resolveDone: (() => void) | null = null;
    const donePromise = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    urls.forEach((url) => {
      this.probeUrl(url)
        .then((result) => {
          console.log(
            `${this.logPrefix} probe ok: ${Math.round(result.kbps)} KB/s, ${result.durationMs}ms -> ${url}`
          );
          results.push({ url, ok: true, score: result.kbps });
        })
        .catch((error: any) => {
          const code = error?.code || error?.statusCode || 'unknown';
          console.warn(`${this.logPrefix} probe failed (${code}) -> ${url}`);
          results.push({ url, ok: false, score: 0, reason: code });
        })
        .finally(() => {
          completed += 1;
          if (completed === urls.length && resolveDone) {
            resolveDone();
          }
        });
    });

    if (this.probeMaxWaitMs > 0) {
      await Promise.race([
        donePromise,
        new Promise((resolve) => setTimeout(resolve, this.probeMaxWaitMs))
      ]);
    } else {
      await donePromise;
    }

    if (completed < urls.length) {
      console.log(`${this.logPrefix} probe early stop after ${this.probeMaxWaitMs}ms (${completed}/${urls.length} finished)`);
    }

    const okResults = results.filter((item) => item.ok);
    const resultsByUrl = new Map(results.map((item) => [item.url, item]));
    const remaining = urls.filter((url) => !resultsByUrl.has(url));
    const rankHost = (url: string): number => {
      try {
        const host = new URL(url).hostname;
        const idx = this.fallbackHostOrder.indexOf(host);
        return idx === -1 ? this.fallbackHostOrder.length + 1 : idx;
      } catch {
        return this.fallbackHostOrder.length + 1;
      }
    };

    if (okResults.length === 0) {
      const blocked = results.filter((item) => !item.ok && (item.reason === 403 || item.reason === 404));
      const failed = results.filter((item) => !item.ok && !(item.reason === 403 || item.reason === 404));
      const ordered = [
        ...failed.map((item) => item.url).sort((a, b) => rankHost(a) - rankHost(b)),
        ...remaining.sort((a, b) => rankHost(a) - rankHost(b)),
        ...blocked.map((item) => item.url).sort((a, b) => rankHost(a) - rankHost(b))
      ];
      console.log(`${this.logPrefix} probe fallback order: ${ordered.map((entry) => new URL(entry).hostname).join(' > ')}`);
      return ordered;
    }

    okResults.sort((a, b) => b.score - a.score);
    const ordered = [
      ...okResults.map((item) => item.url),
      ...results.filter((item) => !item.ok).map((item) => item.url),
      ...remaining
    ];

    console.log(`${this.logPrefix} probe order: ${ordered.map((entry) => new URL(entry).hostname).join(' > ')}`);
    return ordered;
  }

  private probeUrl(url: string): Promise<{ kbps: number; durationMs: number }> {
    const attemptProbe = (family?: 4 | 6): Promise<{ kbps: number; durationMs: number }> => new Promise((resolve, reject) => {
      let finished = false;
      let received = 0;
      const startedAt = Date.now();

      const handleError = (error: Error) => {
        if (finished) return;
        finished = true;
        reject(error);
      };

      const urlObj = new URL(url);
      const requestOptions = {
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        port: urlObj.port ? parseInt(urlObj.port, 10) : undefined,
        path: `${urlObj.pathname}${urlObj.search}`,
        method: 'GET',
        headers: {
          Range: `bytes=0-${this.probeBytes - 1}`,
          'User-Agent': 'Voix'
        },
        ALPNProtocols: ['http/1.1'],
        family
      } as any;
      const request = https.request(requestOptions, (response) => {
          const status = response.statusCode ?? 0;
          if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
            response.resume();
            this.probeUrl(response.headers.location).then(resolve).catch(reject);
            return;
          }

          if (status >= 400) {
            response.resume();
            const err = new Error(`Probe failed (${status})`) as NodeJS.ErrnoException & { statusCode?: number };
            err.statusCode = status;
            handleError(err);
            return;
          }

          response.on('data', (chunk) => {
            received += chunk.length;
            if (received >= this.probeBytes) {
              response.destroy();
            }
          });

          response.on('close', () => {
            if (finished) return;
            finished = true;
            const durationMs = Math.max(1, Date.now() - startedAt);
            const kbps = (received / 1024) / (durationMs / 1000);
            resolve({ kbps, durationMs });
          });
        }
      );

      request.setTimeout(this.probeTimeoutMs, () => {
        const timeoutError = new Error(`Probe timeout after ${this.probeTimeoutMs}ms`);
        (timeoutError as NodeJS.ErrnoException).code = 'ETIMEDOUT';
        request.destroy(timeoutError);
      });

      request.on('error', handleError);
      request.end();
    });

    return attemptProbe(4).catch((error: any) => {
      const code = error?.code as string | undefined;
      const retryableCodes = new Set(['ETIMEDOUT', 'ENETUNREACH', 'EAI_AGAIN']);
      if (code && retryableCodes.has(code)) {
        return attemptProbe(undefined);
      }
      throw error;
    });
  }

  private downloadToFile(
    url: string,
    destPath: string,
    modelId: WhisperModelId,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    const attemptDownload = (family?: 4 | 6): Promise<void> => new Promise((resolve, reject) => {
      let file: fs.WriteStream | null = null;
      let finished = false;
      let started = false;
      let lastLoggedAt = 0;
      let lastLoggedPercent = 0;
      let lastLoggedBytes = 0;

      const handleError = (error: Error) => {
        if (finished) return;
        finished = true;
        try {
          file?.close();
        } catch {
          // Ignore
        }
        (error as NodeJS.ErrnoException & { downloadStarted?: boolean }).downloadStarted = started;
        reject(error);
      };

      const urlObj = new URL(url);
      console.log(`${this.logPrefix} connect (${family ?? 'auto'}): ${urlObj.hostname}`);
      const requestOptions = {
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        port: urlObj.port ? parseInt(urlObj.port, 10) : undefined,
        path: `${urlObj.pathname}${urlObj.search}`,
        headers: {
          'User-Agent': 'Voix'
        },
        ALPNProtocols: ['http/1.1'],
        family
      } as any;
      const request = https.get(requestOptions, (response) => {
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          response.resume();
          console.log(`${this.logPrefix} redirect -> ${response.headers.location}`);
          this.downloadToFile(response.headers.location, destPath, modelId, onProgress).then(resolve).catch(reject);
          return;
        }

        if (status !== 200) {
          response.resume();
          const err = new Error(`Failed to download model (${status})`) as NodeJS.ErrnoException & {
            statusCode?: number;
          };
          err.statusCode = status;
          handleError(err);
          return;
        }

        file = fs.createWriteStream(destPath);

        const totalBytesHeader = response.headers['content-length'];
        const totalBytes = totalBytesHeader ? parseInt(totalBytesHeader, 10) : null;
        let downloadedBytes = 0;

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (!started) {
            started = true;
          }
          if (onProgress) {
            onProgress({
              modelId,
              downloadedBytes,
              totalBytes,
              percent: totalBytes ? downloadedBytes / totalBytes : null
            });
          }

          const now = Date.now();
          if (totalBytes) {
            const percent = Math.floor((downloadedBytes / totalBytes) * 100);
            if (percent >= lastLoggedPercent + 5 || now - lastLoggedAt > 5000) {
              lastLoggedPercent = percent;
              lastLoggedAt = now;
              console.log(`${this.logPrefix} progress ${modelId}: ${percent}%`);
            }
          } else if (downloadedBytes >= lastLoggedBytes + 25 * 1024 * 1024 || now - lastLoggedAt > 5000) {
            lastLoggedBytes = downloadedBytes;
            lastLoggedAt = now;
            const mb = Math.floor(downloadedBytes / (1024 * 1024));
            console.log(`${this.logPrefix} progress ${modelId}: ${mb}MB`);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          if (finished) return;
          finished = true;
          file?.close(() => resolve());
        });

        file.on('error', handleError);
      });

      request.setTimeout(this.connectTimeoutMs, () => {
        const timeoutError = new Error(`Request timeout after ${this.connectTimeoutMs}ms`);
        (timeoutError as NodeJS.ErrnoException).code = 'ETIMEDOUT';
        request.destroy(timeoutError);
      });
      request.on('error', handleError);
    });

    const retryableCodes = new Set(['ETIMEDOUT', 'ENETUNREACH', 'EAI_AGAIN']);
    return attemptDownload(4).catch((error: any) => {
      const code = error?.code as string | undefined;
      const started = Boolean(error?.downloadStarted);
      if (!started && code && retryableCodes.has(code)) {
        return attemptDownload(undefined);
      }
      throw error;
    });
  }
}
