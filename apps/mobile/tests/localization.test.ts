import test from 'node:test';
import assert from 'node:assert/strict';
import { describeLocale } from '@/utils/locale';
import { getLocale, setLocale, translateKey } from '@/i18n';

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

test('common.edit key is available in both locales', () => {
  setLocale('ja-JP');
  try {
    assert.equal(translateKey('common.edit'), '編集');
  } finally {
    setLocale(originalLocale);
  }

  setLocale('en-US');
  try {
    assert.equal(translateKey('common.edit'), 'Edit');
  } finally {
    setLocale(originalLocale);
  }
});

test('settings.menu.history is localized for English UI', () => {
  setLocale('en-US');
  try {
    assert.equal(translateKey('settings.menu.history'), 'View history');
  } finally {
    setLocale(originalLocale);
  }
});

test('report.macro.remaining is localized in both locales', () => {
  setLocale('ja-JP');
  try {
    assert.equal(translateKey('report.macro.remaining', { value: 12 }), '残り 12g');
  } finally {
    setLocale(originalLocale);
  }

  setLocale('en-US');
  try {
    assert.equal(translateKey('report.macro.remaining', { value: 12 }), '12g left');
  } finally {
    setLocale(originalLocale);
  }
});
