// ESM-friendly wrapper so Metro/EAS pick up the mobile Babel config from the repo root.
// Also resolves the worklets plugin from the mobile workspace so bundling doesn't fail on CI.
import { createRequire } from 'module';
import path from 'path';

const rootRequire = createRequire(import.meta.url);
const mobileRequire = createRequire(new URL('./apps/mobile/', import.meta.url));
const mobileBabelConfig = mobileRequire('./babel.config');

export default function babelConfig(api) {
  // Ensure Expo Router env vars are absolute so resolve-from can find expo-router/entry during EAS builds.
const repoRoot = path.dirname(new URL(import.meta.url).pathname);
const appRoot = path.join(repoRoot, 'apps/mobile/app');
const mobileNodeModules = path.join(repoRoot, 'apps/mobile/node_modules');
// Ensure Node can resolve packages (like expo-router) from the mobile workspace during EAS builds.
process.env.NODE_PATH = [mobileNodeModules, process.env.NODE_PATH || ''].filter(Boolean).join(path.delimiter);
rootRequire('module').Module._initPaths();
  process.env.EXPO_ROUTER_APP_ROOT = process.env.EXPO_ROUTER_APP_ROOT ?? appRoot;
  process.env.EXPO_USE_STATIC = process.env.EXPO_USE_STATIC ?? '1';

  const config = mobileBabelConfig(api);
  const plugins =
    config.plugins?.map((plugin) => {
      // Normalize string/tuple forms and resolve from the mobile workspace so the plugin is always found.
      if (plugin === 'react-native-worklets/plugin') {
        return mobileRequire.resolve('react-native-worklets/plugin');
      }
      if (Array.isArray(plugin) && plugin[0] === 'react-native-worklets/plugin') {
        return [mobileRequire.resolve('react-native-worklets/plugin'), ...plugin.slice(1)];
      }
      return plugin;
    }) ?? [];

  return {
    ...config,
    plugins,
  };
}
