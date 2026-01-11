import test from 'node:test';
import assert from 'node:assert/strict';
import { describeLocale } from '@/utils/locale';
import { getLocale, setLocale } from '@/i18n';

const originalLocale = getLocale();

test('describeLocale returns localized labels when UI is Japanese', () => {
  setLocale('ja-JP');
  try {
    assert.equal(describeLocale('ja-JP'), '日本語');
    assert.equal(describeLocale('JA'), '日本語');
    assert.equal(describeLocale('en-US'), '英語');
  } finally {
    setLocale(originalLocale);
  }
});

test('describeLocale returns localized labels when UI is English', () => {
  setLocale('en-US');
  try {
    assert.equal(describeLocale('ja-JP'), 'Japanese');
    assert.equal(describeLocale('EN-gb'), 'English');
  } finally {
    setLocale(originalLocale);
  }
});

test('describeLocale falls back to raw locale for others', () => {
  setLocale('en-US');
  try {
    assert.equal(describeLocale('fr-FR'), 'fr-FR');
  } finally {
    setLocale(originalLocale);
  }
});
