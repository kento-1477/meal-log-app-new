#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const patterns = [
  { name: 'supabase-host', regex: /supabase\.co/i },
  { name: 'raw-session-secret', regex: /SESSION_SECRET\s*=\s*(?!["']?__)/ },
  { name: 'postgres-credentials', regex: /postgresql:\/\/[^"]*(?:postgres|password|kento)/i },
];

const files = execSync('git ls-files', { encoding: 'utf-8' })
  .split('\n')
  .map((f) => f.trim())
  .filter(Boolean)
  .filter((file) => !file.startsWith('.git') && !file.endsWith('.png') && !file.endsWith('.jpg'));

const violations = [];

for (const raw of files) {
  const file = raw.replace(/^"(.+)"$/, '$1');
  if (!existsSync(file)) {
    continue;
  }
  const content = readFileSync(file, 'utf-8');
  for (const { name, regex } of patterns) {
    if (regex.test(content)) {
      violations.push({ file, rule: name });
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
