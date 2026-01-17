// Permission check interval (in milliseconds)
const CHECK_INTERVAL = 2000;

let checkInterval = null;

// DOM elements
const openSettingsBtn = document.getElementById('openSettingsBtn');
const cancelBtn = document.getElementById('cancelBtn');
const statusBox = document.getElementById('statusBox');
const statusText = document.getElementById('statusText');

// Open System Settings button click handler
openSettingsBtn.addEventListener('click', async () => {
  try {
    await window.electronAPI.requestAccessibilityPermission();
    // Show checking status
    statusBox.classList.add('checking');
    statusBox.classList.remove('granted');
    statusText.classList.remove('granted');
    statusText.innerHTML = '<div class="spinner"></div><span>Waiting for permission to be granted...</span>';
    // Start polling for permission
    startPolling();
  } catch (error) {
    console.error('Failed to open System Settings:', error);
  }
});

// Cancel button click handler - closes the window
cancelBtn.addEventListener('click', () => {
  window.electronAPI.closePermissionWindow();
});

// Start polling for permission status
function startPolling() {
  // Clear any existing interval
  if (checkInterval) {
    clearInterval(checkInterval);
  }

  // Check immediately
  checkPermission();

  // Then check periodically
  checkInterval = setInterval(checkPermission, CHECK_INTERVAL);
}

// Check if permission has been granted
async function checkPermission() {
  try {
    const hasPermission = await window.electronAPI.checkAccessibilityPermission();

    if (hasPermission) {
      // Permission granted!
      stopPolling();
      showPermissionGranted();

      // Notify main process and close window after a short delay
      setTimeout(async () => {
        await window.electronAPI.permissionGranted();
        window.close();
      }, 1500);
    }
  } catch (error) {
    console.error('Error checking permission:', error);
  }
}

// Stop polling for permission
function stopPolling() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

// Show permission granted status
function showPermissionGranted() {
  statusBox.classList.remove('checking');
  statusBox.classList.add('granted');
  statusText.classList.add('granted');
  statusText.innerHTML = '<span>✓ Permission granted! Starting hotkey monitoring...</span>';
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  stopPolling();
});

// Initial permission check on page load (in case it was already granted)
(async () => {
  try {
    const hasPermission = await window.electronAPI.checkAccessibilityPermission();
    if (hasPermission) {
      showPermissionGranted();
      setTimeout(async () => {
        await window.electronAPI.permissionGranted();
        window.close();
      }, 1000);
    }
  } catch (error) {
    console.error('Error on initial permission check:', error);
  }
})();
