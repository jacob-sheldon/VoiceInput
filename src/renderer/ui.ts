(() => {
  const statusText = document.getElementById('statusText') as HTMLElement;
  const soundWave = document.getElementById('soundWave') as HTMLElement;
  const loadingDots = document.getElementById('loadingDots') as HTMLElement;
  const waveBars = soundWave.querySelectorAll('.wave-bar') as NodeListOf<HTMLElement>;

  const statusMap = {
    idle: { text: 'Idle' },
    listening: { text: 'Recording' },
    transcribing: { text: 'Transcribing...' },
    typing: { text: 'Typing...' }
  };

  function updateState(state: string): void {
    const status = statusMap[state as keyof typeof statusMap];
    if (status) {
      statusText.textContent = status.text;

      // Show/hide animations based on state
      switch (state) {
        case 'listening':
          soundWave.style.display = 'flex';
          loadingDots.style.display = 'none';
          break;
        case 'transcribing':
          soundWave.style.display = 'none';
          loadingDots.style.display = 'flex';
          break;
        case 'typing':
        case 'idle':
        default:
          soundWave.style.display = 'none';
          loadingDots.style.display = 'none';
          break;
      }
    }
  }

  function updateWaveBars(level: number): void {
    // Level is 0.0 to 1.0
    // Scale each bar with some variation for visual interest
    const baseHeight = 4;
    const maxHeight = 24;
    const range = maxHeight - baseHeight;

    waveBars.forEach((bar, index) => {
      // Add some variation based on bar position
      const variation = 1 + (Math.sin(index * 0.8) * 0.3);
      const height = baseHeight + (level * range * variation);
      bar.style.height = `${Math.min(maxHeight, Math.max(baseHeight, height))}px`;
    });
  }

  // Listen for audio level updates
  if (window.electronAPI && window.electronAPI.onAudioLevel) {
    window.electronAPI.onAudioLevel((level: number) => {
      updateWaveBars(level);
    });
  }

  // Listen for state changes
  if (window.electronAPI) {
    window.electronAPI.onStateChanged(updateState);

    // Get initial state
    window.electronAPI.getState().then(updateState);
  }
})();
