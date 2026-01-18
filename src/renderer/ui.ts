(() => {
  const statusDot = document.getElementById('statusDot') as HTMLElement;
  const statusText = document.getElementById('statusText') as HTMLElement;
  const textPreview = document.getElementById('textPreview') as HTMLElement;

  const statusMap = {
    idle: { text: 'Idle', class: 'idle' },
    listening: { text: 'Listening...', class: 'listening' },
    transcribing: { text: 'Transcribing...', class: 'transcribing' },
    typing: { text: 'Typing...', class: 'typing' }
  };

  function updateState(state: string): void {
    console.log('[RENDERER] updateState called with:', state);
    const status = statusMap[state as keyof typeof statusMap];
    if (status) {
      console.log('[RENDERER] Updating UI to:', status.text, 'class:', status.class);
      statusDot.className = `status-dot ${status.class}`;
      statusText.textContent = status.text;
    } else {
      console.log('[RENDERER] Unknown state:', state);
    }
  }

  function showTextResult(text: string): void {
    textPreview.textContent = text;
    textPreview.className = 'text-preview has-content';

    // Clear after a delay
    setTimeout(() => {
      textPreview.textContent = 'Waiting for input...';
      textPreview.className = 'text-preview empty';
    }, 3000);
  }

  // Listen for state changes
  if (window.electronAPI) {
    window.electronAPI.onStateChanged(updateState);
    window.electronAPI.onTextResult(showTextResult);

    // Get initial state
    window.electronAPI.getState().then(updateState);
  }
})();
