const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.resolver = {
  ...(config.resolver || {}),
  alias: {
    ...(config.resolver?.alias || {}),
    '@': path.join(projectRoot, 'src'),
  },
};

module.exports = config;
