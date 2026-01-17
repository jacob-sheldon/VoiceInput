try {
  module.exports = require('../../../build/Release/text_injection.node');
} catch (error) {
  // Fallback for development
  console.error('TextInjection native module not built. Please run: npm run build:native');
  throw error;
}
