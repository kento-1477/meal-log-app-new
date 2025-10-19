import test from 'node:test';
import assert from 'node:assert/strict';
import { describeLocale } from '@/utils/locale';

test('describeLocale returns Japanese label for ja', () => {
  assert.equal(describeLocale('ja-JP'), '日本語');
  assert.equal(describeLocale('JA'), '日本語');
});

test('describeLocale returns English label for en', () => {
  assert.equal(describeLocale('en-US'), '英語');
  assert.equal(describeLocale('EN-gb'), '英語');
});

test('describeLocale falls back to raw locale for others', () => {
  assert.equal(describeLocale('fr-FR'), 'fr-FR');
});
