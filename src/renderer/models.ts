type ModelState = {
  id: string;
  label: string;
  file: string;
  sizeMB: number;
  description: string;
  qualityRank: number;
  installed: boolean;
  sizeBytes?: number;
  path: string;
};

type DownloadProgress = {
  modelId: string;
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
};

(() => {
  const modelList = document.getElementById('modelList') as HTMLElement;
  const statusPill = document.getElementById('statusPill') as HTMLElement;
  const toast = document.getElementById('toast') as HTMLElement;
  const refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement;
  const closeBtn = document.getElementById('closeBtn') as HTMLButtonElement;
  const storagePath = document.getElementById('storagePath') as HTMLElement;

  let cachedModels: ModelState[] = [];
  let bestModelId: string | null = null;
  let activeModelId: string | null = null;
  const downloads = new Map<string, DownloadProgress>();

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  };

  const formatSize = (model: ModelState): string => {
    if (typeof model.sizeBytes === 'number') {
      return formatBytes(model.sizeBytes);
    }
    return `${model.sizeMB} MB`;
  };

  const showToast = (message: string): void => {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2200);
  };

  const updateStatus = (): void => {
    if (activeModelId) {
      const active = cachedModels.find((model) => model.id === activeModelId);
      statusPill.textContent = active ? `Active model: ${active.label}` : 'Active model selected';
      statusPill.classList.remove('warning');
      return;
    }
    if (bestModelId) {
      const best = cachedModels.find((model) => model.id === bestModelId);
      statusPill.textContent = best ? `Auto-selected: ${best.label}` : 'Best model installed';
      statusPill.classList.remove('warning');
      return;
    }
    statusPill.textContent = 'No model installed';
    statusPill.classList.add('warning');
  };

  const render = (): void => {
    modelList.innerHTML = '';
    cachedModels.forEach((model, index) => {
      const card = document.createElement('div');
      card.className = 'model-card';
      card.style.animationDelay = `${index * 0.06}s`;
      card.dataset.modelId = model.id;

      if (model.installed) {
        card.classList.add('installed');
      }

      if (bestModelId === model.id) {
        card.classList.add('best');
      }

      if (activeModelId === model.id) {
        card.classList.add('active');
      }

      const title = document.createElement('div');
      title.className = 'model-title';
      const h3 = document.createElement('h3');
      h3.textContent = model.label;
      title.appendChild(h3);

      const badgeWrap = document.createElement('div');
      badgeWrap.className = 'model-badges';
      title.appendChild(badgeWrap);

      const meta = document.createElement('div');
      meta.className = 'model-meta';
      meta.textContent = model.description;

      const footer = document.createElement('div');
      footer.className = 'model-footer';

      const size = document.createElement('div');
      size.className = 'size';
      size.textContent = formatSize(model);

      const actionGroup = document.createElement('div');
      actionGroup.className = 'action-group';

      if (model.installed) {
        const selectBtn = document.createElement('button');
        selectBtn.className = 'action-btn select';
        selectBtn.textContent = activeModelId === model.id ? 'Active' : 'Use';
        selectBtn.addEventListener('click', async () => {
          if (activeModelId === model.id) return;
          try {
            await window.electronAPI.setActiveModelId(model.id);
            showToast(`${model.label} is now active`);
            await refresh();
          } catch (error: any) {
            showToast(error?.message || 'Failed to switch model');
          }
        });
        actionGroup.appendChild(selectBtn);
      }

      const actionBtn = document.createElement('button');
      actionBtn.className = `action-btn main ${model.installed ? 'delete' : 'download'}`;
      actionBtn.textContent = model.installed ? 'Delete' : 'Download';

      actionBtn.addEventListener('click', async () => {
        if (model.installed) {
          try {
            await window.electronAPI.deleteModel(model.id);
            showToast(`${model.label} deleted`);
            await refresh();
          } catch (error: any) {
            showToast(error?.message || 'Delete failed');
          }
          return;
        }

        actionBtn.disabled = true;
        downloads.set(model.id, {
          modelId: model.id,
          downloadedBytes: 0,
          totalBytes: null,
          percent: 0
        });
        render();
        window.electronAPI.downloadModel(model.id).catch((error: any) => {
          downloads.delete(model.id);
          render();
          showToast(error?.message || 'Download failed');
        });
      });

      actionGroup.appendChild(actionBtn);
      footer.appendChild(size);
      footer.appendChild(actionGroup);

      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(footer);

      const progressWrap = document.createElement('div');
      progressWrap.className = 'progress';
      progressWrap.style.display = 'none';
      const bar = document.createElement('div');
      bar.className = 'progress-bar';
      progressWrap.appendChild(bar);
      card.appendChild(progressWrap);

      const progressText = document.createElement('div');
      progressText.className = 'progress-text';
      progressText.style.display = 'none';
      card.appendChild(progressText);

      modelList.appendChild(card);

      updateCardUI(model.id);
    });

    updateStatus();
  };

  const refresh = async (): Promise<void> => {
    cachedModels = await window.electronAPI.listModels();
    bestModelId = await window.electronAPI.getBestModelId();
    activeModelId = await window.electronAPI.getActiveModelId();
    const dirs = await window.electronAPI.getModelDirectories();
    storagePath.textContent = dirs.legacy
      ? `Scanning: ${dirs.primary} (primary), ${dirs.legacy} (legacy)`
      : `Scanning: ${dirs.primary}`;
    render();
  };

  const updateCardUI = (modelId: string): void => {
    const card = modelList.querySelector(`[data-model-id="${modelId}"]`) as HTMLElement | null;
    const model = cachedModels.find((item) => item.id === modelId);
    if (!card || !model) return;

    if (model.installed) {
      card.classList.add('installed');
    } else {
      card.classList.remove('installed');
    }

    if (bestModelId === model.id) {
      card.classList.add('best');
    } else {
      card.classList.remove('best');
    }

    if (activeModelId === model.id) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }

    const actionBtn = card.querySelector('.action-btn.main') as HTMLButtonElement | null;
    const selectBtn = card.querySelector('.action-btn.select') as HTMLButtonElement | null;
    const progressWrap = card.querySelector('.progress') as HTMLElement | null;
    const progressBar = card.querySelector('.progress-bar') as HTMLElement | null;
    const progressText = card.querySelector('.progress-text') as HTMLElement | null;
    const badgeWrap = card.querySelector('.model-badges') as HTMLElement | null;

    if (badgeWrap) {
      badgeWrap.innerHTML = '';
      if (model.id === 'medium') {
        const recommendedBadge = document.createElement('span');
        recommendedBadge.className = 'model-badge recommended';
        recommendedBadge.textContent = '推荐';
        badgeWrap.appendChild(recommendedBadge);
      }
      if (bestModelId === model.id) {
        const bestBadge = document.createElement('span');
        bestBadge.className = 'model-badge best';
        bestBadge.textContent = 'Best';
        badgeWrap.appendChild(bestBadge);
      }
      if (activeModelId === model.id) {
        const activeBadge = document.createElement('span');
        activeBadge.className = 'model-badge active';
        activeBadge.textContent = 'Active';
        badgeWrap.appendChild(activeBadge);
      }
      if (model.installed) {
        const installedBadge = document.createElement('span');
        installedBadge.className = 'model-badge installed';
        installedBadge.textContent = 'Installed';
        badgeWrap.appendChild(installedBadge);
      }
    }

    const progress = downloads.get(modelId);
    if (selectBtn) {
      const isActive = activeModelId === model.id;
      selectBtn.textContent = isActive ? 'Active' : 'Use';
      selectBtn.disabled = isActive || Boolean(progress);
      selectBtn.classList.toggle('active', isActive);
    }
    if (actionBtn) {
      if (progress) {
        const percent = progress.percent ? Math.min(100, Math.floor(progress.percent * 100)) : null;
        actionBtn.textContent = percent !== null ? `Downloading ${percent}%` : 'Downloading...';
        actionBtn.disabled = true;
        actionBtn.classList.remove('delete');
        actionBtn.classList.add('download');
      } else {
        actionBtn.disabled = false;
        actionBtn.textContent = model.installed ? 'Delete' : 'Download';
        actionBtn.classList.toggle('delete', model.installed);
        actionBtn.classList.toggle('download', !model.installed);
      }
    }

    if (progressWrap && progressBar && progressText) {
      if (progress) {
        progressWrap.style.display = 'block';
        progressText.style.display = 'block';
        progressBar.classList.remove('indeterminate');
        const percent = progress.percent ? Math.min(100, Math.floor(progress.percent * 100)) : null;
        if (percent === null) {
          progressBar.classList.add('indeterminate');
          progressBar.style.width = '40%';
        } else {
          progressBar.style.width = `${percent}%`;
        }
        if (progress.totalBytes) {
          progressText.textContent = `${formatBytes(progress.downloadedBytes)} / ${formatBytes(progress.totalBytes)}`;
        } else {
          progressText.textContent = `${formatBytes(progress.downloadedBytes)} downloaded`;
        }
      } else {
        progressWrap.style.display = 'none';
        progressText.style.display = 'none';
      }
    }
  };

  refreshBtn.addEventListener('click', () => refresh());
  closeBtn.addEventListener('click', () => window.close());

  window.electronAPI.onModelDownloadProgress((progress: DownloadProgress) => {
    downloads.set(progress.modelId, progress);
    updateCardUI(progress.modelId);
  });

  window.electronAPI.onModelDownloadComplete((payload: { modelId: string }) => {
    downloads.delete(payload.modelId);
    showToast('Download complete');
    refresh();
  });

  window.electronAPI.onModelDownloadError((payload: { modelId: string; message: string }) => {
    downloads.delete(payload.modelId);
    showToast(payload.message || 'Download failed');
    refresh();
  });

  refresh();
})();
