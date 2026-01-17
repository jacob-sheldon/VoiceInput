try {
  module.exports = require('../../../build/Release/audio_recorder.node');
} catch (error) {
  console.error('AudioRecorder native module not built. Please run: npm run build:native');
  throw error;
}
