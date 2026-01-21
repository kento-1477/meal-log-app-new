import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(dirname, '..');
const configPath = path.join(appRoot, 'app.json');
const iosRoot = path.join(appRoot, 'ios');
const infoPlistPath = path.join(iosRoot, 'app', 'Info.plist');
const pbxprojPath = path.join(iosRoot, 'app.xcodeproj', 'project.pbxproj');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeIfChanged(filePath, nextContent) {
  const current = fs.readFileSync(filePath, 'utf8');
  if (current !== nextContent) {
    fs.writeFileSync(filePath, nextContent);
  }
}

function replacePlistValue(content, key, value) {
  const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)([^<]*)(</string>)`);
  if (!pattern.test(content)) {
    throw new Error(`Missing ${key} in Info.plist`);
  }
  return content.replace(pattern, `$1${value}$3`);
}

function replacePbxprojValue(content, key, value) {
  const pattern = new RegExp(`${key} = [^;]+;`, 'g');
  if (!pattern.test(content)) {
    throw new Error(`Missing ${key} in project.pbxproj`);
  }
  return content.replace(pattern, `${key} = ${value};`);
}

const config = readJson(configPath);
const version = config?.expo?.version;
const buildNumber = config?.expo?.ios?.buildNumber;

if (!version || !buildNumber) {
  throw new Error('app.json is missing expo.version or expo.ios.buildNumber');
}

const buildNumberValue = String(buildNumber);

const infoPlist = fs.readFileSync(infoPlistPath, 'utf8');
const nextInfoPlist = replacePlistValue(
  replacePlistValue(infoPlist, 'CFBundleShortVersionString', version),
  'CFBundleVersion',
  buildNumberValue,
);
writeIfChanged(infoPlistPath, nextInfoPlist);

const pbxproj = fs.readFileSync(pbxprojPath, 'utf8');
const nextPbxproj = replacePbxprojValue(
  replacePbxprojValue(pbxproj, 'MARKETING_VERSION', version),
  'CURRENT_PROJECT_VERSION',
  buildNumberValue,
);
writeIfChanged(pbxprojPath, nextPbxproj);
