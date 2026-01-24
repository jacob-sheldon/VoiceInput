(() => {
  const cancelBtn = document.getElementById('cancelBtn') as HTMLButtonElement;
  const downloadBtn = document.getElementById('downloadBtn') as HTMLButtonElement;

  cancelBtn.addEventListener('click', () => {
    window.close();
  });

  downloadBtn.addEventListener('click', async () => {
    try {
      await window.electronAPI.openModelsWindow();
    } finally {
      window.close();
    }
  });
})();
