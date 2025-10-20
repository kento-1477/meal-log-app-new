export interface ExportItem {
  foodItem: string;
  recordedAt: string;
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

interface ExportStrings {
  headers: [string, string, string, string, string, string];
  title: string;
}

const EXPORT_STRINGS: Record<'ja' | 'en', ExportStrings> = {
  ja: {
    headers: ['記録日時', '料理名', 'カロリー(kcal)', 'たんぱく質(g)', '脂質(g)', '炭水化物(g)'],
    title: '食事記録',
  },
  en: {
    headers: ['Recorded at', 'Meal', 'Calories (kcal)', 'Protein (g)', 'Fat (g)', 'Carbs (g)'],
    title: 'Meal Log',
  },
};

function resolveStrings(locale: string): ExportStrings {
  if (locale?.toLowerCase().startsWith('en')) {
    return EXPORT_STRINGS.en;
  }
  return EXPORT_STRINGS.ja;
}

export function buildCsv(items: ExportItem[], locale: string): string {
  const strings = resolveStrings(locale);
  const rows = items.map((item) => [
    formatDatetime(item.recordedAt, locale),
    item.foodItem,
    Math.round(item.calories),
    round1(item.proteinG),
    round1(item.fatG),
    round1(item.carbsG),
  ]);

  return [strings.headers, ...rows]
    .map((columns) =>
      columns
        .map((value) => {
          const text = String(value ?? '');
          if (text.includes('"')) {
            return `"${text.replace(/"/g, '""')}"`;
          }
          return text.includes(',') ? `"${text}"` : text;
        })
        .join(','),
    )
    .join('\n');
}

export function buildPdfHtml(items: ExportItem[], fromIso: string, toIso: string, locale: string): string {
  const strings = resolveStrings(locale);
  const rows = items
    .map(
      (item) => `
        <tr>
          <td>${formatDatetime(item.recordedAt, locale)}</td>
          <td>${escapeHtml(item.foodItem)}</td>
          <td>${Math.round(item.calories)}</td>
          <td>${round1(item.proteinG)}</td>
          <td>${round1(item.fatG)}</td>
          <td>${round1(item.carbsG)}</td>
        </tr>
      `,
    )
    .join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif; padding: 24px; }
          h1 { font-size: 20px; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 12px; }
          th { background-color: #f4f4f4; }
        </style>
      </head>
      <body>
        <h1>${strings.title} (${formatDatetime(fromIso, locale)} – ${formatDatetime(toIso, locale)})</h1>
        <table>
          <thead>
            <tr>
              ${strings.headers.map((header) => `<th>${header}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `;
}

export function formatDatetime(isoString: string, locale: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  return new Intl.DateTimeFormat(locale.startsWith('en') ? 'en-US' : 'ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (match) => {
    switch (match) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case '\'':
        return '&#39;';
      default:
        return match;
    }
  });
}
