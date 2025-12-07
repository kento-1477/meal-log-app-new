#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, lstatSync } from 'node:fs';

const patterns = [
  {
    name: 'supabase-host',
    regex: /db\.[a-z0-9-]+\.supabase\.co/gi,
  },
  {
    name: 'raw-session-secret',
    regex: /SESSION_SECRET\s*=\s*([^\n]+)/gi,
    isViolation: (value) => {
      const trimmed = value.trim().replace(/^["']|["']$/g, '');
      return !(trimmed.startsWith('__') || trimmed.startsWith('<'));
    },
  },
  {
    name: 'postgres-credentials',
    regex: /postgresql:\/\/[^\s'"]+/gi,
    isViolation: (value) => /(supabase\.co|kentoosonou|aws-1-ap)/i.test(value),
  },
];

const files = execSync('git ls-files', { encoding: 'utf-8' })
  .split('\n')
  .map((f) => f.trim())
  .filter(Boolean)
  .filter((file) => !file.startsWith('.git') && !file.endsWith('.png') && !file.endsWith('.jpg'));

const violations = [];

for (const raw of files) {
  const file = raw.replace(/^"(.+)"$/, '$1');
  if (!existsSync(file) || lstatSync(file).isDirectory()) {
    continue;
  }
  const content = readFileSync(file, 'utf-8');
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(content)) !== null) {
      const candidate = match[1] ?? match[0];
      const isBad = pattern.isViolation ? pattern.isViolation(candidate, file) : true;
      if (isBad) {
        violations.push({ file, rule: pattern.name });
        break;
      }
    }
  }
}

if (violations.length) {
  console.error('Secret scan failed. Remove or rotate leaked values:');
  for (const violation of violations) {
    console.error(`- [${violation.rule}] ${violation.file}`);
  }
  process.exit(1);
}

console.log('Secret scan passed – no obvious credentials found.');
