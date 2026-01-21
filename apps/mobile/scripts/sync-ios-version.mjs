import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, '..');
const appJsonPath = path.join(mobileRoot, 'app.json');
const infoPlistPath = path.join(mobileRoot, 'ios', 'app', 'Info.plist');
const pbxprojPath = path.join(mobileRoot, 'ios', 'app.xcodeproj', 'project.pbxproj');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function updatePlistValue(content, key, value) {
  const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)([^<]*)(</string>)`);
  if (!pattern.test(content)) {
    throw new Error(`Missing ${key} in ${infoPlistPath}`);
  }
  return content.replace(pattern, `$1${value}$3`);
}

function updatePbxprojSetting(content, key, value) {
  const pattern = new RegExp(`(\\b${key}\\s*=\\s*)([^;]+)(;)`, 'g');
  if (!content.match(pattern)) {
    throw new Error(`Missing ${key} in ${pbxprojPath}`);
  }
  return content.replace(pattern, `$1${value}$3`);
}

const appJson = readJson(appJsonPath);
const expo = appJson.expo;

if (!expo || typeof expo !== 'object') {
  throw new Error('Missing "expo" config in app.json');
}

const version = expo.version;
if (!version) {
  throw new Error('Missing "expo.version" in app.json');
}

const ios = expo.ios || {};
let buildNumber = ios.buildNumber;
if (!buildNumber) {
  throw new Error('Missing "expo.ios.buildNumber" in app.json');
}

buildNumber = String(buildNumber);

const configuration = process.env.CONFIGURATION || '';
const action = (process.env.ACTION || '').toLowerCase();
const isRelease = /release/i.test(configuration);
const isArchive =
  Boolean(process.env.ARCHIVE_PATH) || action === 'install' || action === 'archive';
const autoIncrementSetting = process.env.EXPO_AUTO_INCREMENT_BUILD;
const shouldAutoIncrement =
  autoIncrementSetting === '1' || (autoIncrementSetting !== '0' && isRelease && isArchive);

if (shouldAutoIncrement) {
  const numericBuild = Number(buildNumber);
  if (!Number.isInteger(numericBuild)) {
    throw new Error(`Expected expo.ios.buildNumber to be an integer, got "${buildNumber}"`);
  }
  buildNumber = String(numericBuild + 1);
  appJson.expo = { ...expo, ios: { ...ios, buildNumber } };
  writeJson(appJsonPath, appJson);
}

const infoPlist = fs.readFileSync(infoPlistPath, 'utf8');
let updatedPlist = updatePlistValue(infoPlist, 'CFBundleShortVersionString', version);
updatedPlist = updatePlistValue(updatedPlist, 'CFBundleVersion', buildNumber);
if (updatedPlist !== infoPlist) {
  fs.writeFileSync(infoPlistPath, updatedPlist);
}

const pbxproj = fs.readFileSync(pbxprojPath, 'utf8');
let updatedPbxproj = updatePbxprojSetting(pbxproj, 'MARKETING_VERSION', version);
updatedPbxproj = updatePbxprojSetting(updatedPbxproj, 'CURRENT_PROJECT_VERSION', buildNumber);
if (updatedPbxproj !== pbxproj) {
  fs.writeFileSync(pbxprojPath, updatedPbxproj);
}

console.log(`[sync-ios-version] version=${version} build=${buildNumber}`);
