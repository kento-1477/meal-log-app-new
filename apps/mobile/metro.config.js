const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.resolver = {
  ...(config.resolver || {}),
  unstable_enableSymlinks: true,
  alias: {
    ...(config.resolver?.alias || {}),
    '@': path.join(projectRoot, 'src'),
  },
};

config.watcher = { watchman: false };

module.exports = config;
