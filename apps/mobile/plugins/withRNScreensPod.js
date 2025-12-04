const fs = require('fs');
const path = require('path');
const { withPodfile } = require('@expo/config-plugins');

/**
 * Ensure RNScreens is added to the iOS Podfile even when autolinking misses it
 * in monorepo / hoisted installs.
 */
module.exports = function withRNScreensPod(config) {
  return withPodfile(config, (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const candidates = [
      path.join(projectRoot, 'node_modules', 'react-native-screens'),
      path.join(projectRoot, 'apps', 'mobile', 'node_modules', 'react-native-screens'),
    ];
    const resolvedPath = candidates.find((p) => fs.existsSync(path.join(p, 'RNScreens.podspec')));
    const podLine = resolvedPath
      ? `  pod 'RNScreens', :path => '${resolvedPath}'`
      : "  pod 'RNScreens'";
    const lines = config.modResults.contents.split('\n');

    if (lines.some((line) => line.includes("pod 'RNScreens'"))) {
      return config;
    }

    const idx = lines.findIndex((line) => line.includes('use_expo_modules!'));
    if (idx !== -1) {
      // Insert on the next line to avoid corrupting Podfile syntax.
      lines.splice(idx + 1, 0, podLine);
      config.modResults.contents = lines.join('\n');
    }

    return config;
  });
};
