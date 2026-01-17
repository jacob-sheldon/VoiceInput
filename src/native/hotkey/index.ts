try {
  module.exports = require('../../../build/Release/hotkey_monitor.node');
} catch (error) {
  // Fallback for development
  console.error('HotkeyMonitor native module not built. Please run: npm run build:native');
  throw error;
}
