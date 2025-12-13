import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(mobileRoot, '..', '..');

const hoistedReactNativePath = path.join(repoRoot, 'node_modules', 'react-native');
const localNodeModulesPath = path.join(mobileRoot, 'node_modules');
const localReactNativePath = path.join(localNodeModulesPath, 'react-native');

function pathExists(targetPath) {
  try {
    fs.lstatSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

if (pathExists(localReactNativePath)) {
  process.exit(0);
}

if (!pathExists(hoistedReactNativePath)) {
  console.warn(
    `[ensure-hoisted-react-native] Missing React Native at ${hoistedReactNativePath}. Run npm install at the repo root first.`,
  );
  process.exit(0);
}

fs.mkdirSync(localNodeModulesPath, { recursive: true });
fs.symlinkSync(hoistedReactNativePath, localReactNativePath, 'dir');
console.log(`[ensure-hoisted-react-native] Linked ${localReactNativePath} -> ${hoistedReactNativePath}`);
