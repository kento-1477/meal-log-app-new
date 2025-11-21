process.env.EXPO_ROUTER_APP_ROOT = 'app';

const path = require('path');

process.env.EXPO_ROUTER_APP_ROOT = 'app';
process.env.EXPO_ROUTER_ABS_APP_ROOT = path.join(__dirname, 'app');

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
