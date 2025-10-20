import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCsv, buildPdfHtml, escapeHtml, formatDatetime, round1, type ExportItem } from '../src/utils/logExport.ts';

test('buildCsv returns CSV header and quoted fields', () => {
  const items: ExportItem[] = [
    {
      foodItem: 'サラダ, ドレッシング付き',
      recordedAt: '2025-01-01T12:00:00.000Z',
      calories: 123.4,
      proteinG: 10.456,
      fatG: 5.678,
      carbsG: 12.345,
    },
  ];

  const csv = buildCsv(items, 'ja-JP');
  const lines = csv.split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], '記録日時,料理名,カロリー(kcal),たんぱく質(g),脂質(g),炭水化物(g)');
  assert.match(lines[1], /^\d{4}\/\d{2}\/\d{2}/);
  assert.ok(lines[1].includes('"サラダ, ドレッシング付き"'));
  assert.ok(lines[1].includes('123'));
});

test('buildPdfHtml escapes HTML and shows range heading', () => {
  const items: ExportItem[] = [
    {
      foodItem: '焼き魚 & サラダ <小>',
      recordedAt: '2025-02-01T09:00:00.000Z',
      calories: 245,
      proteinG: 30,
      fatG: 8,
      carbsG: 12,
    },
  ];

  const html = buildPdfHtml(items, '2025-02-01T00:00:00.000Z', '2025-02-02T00:00:00.000Z', 'ja-JP');
  assert.ok(html.includes('食事記録'));
  assert.ok(html.includes('&amp;'));
  assert.ok(html.includes('&lt;'));
  assert.ok(html.includes('&gt;'));
  assert.ok(html.includes('245'));
});

test('buildCsv uses English headers for en locale', () => {
  const items: ExportItem[] = [
    {
      foodItem: 'Chicken salad',
      recordedAt: '2025-03-15T12:00:00.000Z',
      calories: 320,
      proteinG: 25,
      fatG: 12,
      carbsG: 18,
    },
  ];

  const csv = buildCsv(items, 'en-US');
  const lines = csv.split('\n');
  assert.equal(lines[0], 'Recorded at,Meal,Calories (kcal),Protein (g),Fat (g),Carbs (g)');
  assert.ok(lines[1].includes('Chicken salad'));
});

test('formatDatetime falls back to original string on invalid date', () => {
  const formatted = formatDatetime('2000-01-01T00:00:00.000Z', 'ja-JP');
  assert.match(formatted, /2000/);
  assert.equal(formatDatetime('not-a-date', 'ja-JP'), 'not-a-date');
});

test('round1 rounds to single decimal place', () => {
  assert.equal(round1(10.44), 10.4);
  assert.equal(round1(10.46), 10.5);
});

test('escapeHtml escapes reserved characters', () => {
  assert.equal(escapeHtml('<script>"&"</script>'), '&lt;script&gt;&quot;&amp;&quot;&lt;/script&gt;');
});
