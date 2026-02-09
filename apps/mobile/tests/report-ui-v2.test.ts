import test from 'node:test';
import assert from 'node:assert/strict';
import type { AiReportResponse } from '@meal-log/shared';
import {
  buildReportIdentityLevel,
  buildSummaryEvidenceCards,
  formatGeneratedDate,
} from '../src/features/report/report-view-model.ts';
import { resolveReportUiVariant } from '../src/features/report/ui-variant.ts';

function createReport(highlights: string[]): AiReportResponse {
  return {
    period: 'daily',
    range: {
      from: '2026-02-08',
      to: '2026-02-08',
      timezone: 'Asia/Tokyo',
    },
    summary: {
      headline: '最優先課題: たんぱく質不足',
      score: 68,
      highlights,
    },
    metrics: [
      { label: '平均カロリー', value: '1272 kcal' },
    ],
    advice: [
      { priority: 'high', title: '修正', detail: '最優先で修正: 1日2食に増やす' },
    ],
    ingredients: [
      { name: '鶏むね肉', reason: 'たんぱく質補給' },
    ],
  };
}

test('buildReportIdentityLevel returns expected level by score and streak', () => {
  assert.equal(buildReportIdentityLevel(40, 1), 'baseline');
  assert.equal(buildReportIdentityLevel(60, 2), 'builder');
  assert.equal(buildReportIdentityLevel(72, 4), 'driver');
  assert.equal(buildReportIdentityLevel(86, 14), 'elite');
});

test('buildSummaryEvidenceCards extracts numeric evidence from highlights', () => {
  const report = createReport([
    'たんぱく質が目標より94.4g不足',
    '全カロリー1272kcalを昼食1食で摂取',
    '脂質が目標を19.6g超過',
  ]);
  const cards = buildSummaryEvidenceCards(report);
  assert.equal(cards.length, 3);
  assert.equal(cards[0].emphasis, '94.4g');
  assert.equal(cards[1].emphasis, '1272kcal');
  assert.equal(cards[2].emphasis, '19.6g');
});

test('resolveReportUiVariant deterministically buckets user id', () => {
  const first = resolveReportUiVariant({
    userId: 123,
    enabled: true,
    rolloutPercent: 30,
  });
  const second = resolveReportUiVariant({
    userId: 123,
    enabled: true,
    rolloutPercent: 30,
  });
  assert.equal(first.userBucket, second.userBucket);
  assert.equal(first.variant, second.variant);
});

test('formatGeneratedDate respects timezone conversion', () => {
  const utcIso = '2026-02-08T23:30:00.000Z';
  const ja = formatGeneratedDate(utcIso, 'ja-JP', 'Asia/Tokyo');
  const en = formatGeneratedDate(utcIso, 'en-US', 'America/Los_Angeles');
  assert.equal(ja, '2026/02/09');
  assert.equal(en, 'Feb 08, 2026');
});
