import { DateTime } from 'luxon';
import type { AiReportResponse } from '@meal-log/shared';

export type ReportIdentityLevel = 'baseline' | 'builder' | 'driver' | 'elite';

export type SummaryEvidenceCard = {
  id: string;
  icon: string;
  text: string;
  emphasis: string | null;
  tone: 'amber' | 'mint' | 'violet';
};

const EVIDENCE_ICONS = ['📌', '📊', '🧪'] as const;
const EVIDENCE_TONES: SummaryEvidenceCard['tone'][] = ['amber', 'mint', 'violet'];
const NUMERIC_EVIDENCE_PATTERN = /([+-]?\d+(?:[.,]\d+)?\s*(?:kcal|g|%|日|days|kg|回)?)/i;

export function buildReportIdentityLevel(score: number, streakDays: number): ReportIdentityLevel {
  if (score >= 85 && streakDays >= 14) {
    return 'elite';
  }
  if (score >= 70 || streakDays >= 7) {
    return 'driver';
  }
  if (score >= 55 || streakDays >= 3) {
    return 'builder';
  }
  return 'baseline';
}

export function getReportIdentityLabelKey(level: ReportIdentityLevel) {
  return `report.identity.level.${level}` as const;
}

export function formatGeneratedDate(value: string, locale: string, timezone?: string) {
  const parsed = DateTime.fromISO(value);
  if (!parsed.isValid) {
    return null;
  }
  const zoned = timezone ? parsed.setZone(timezone) : parsed;
  if (!zoned.isValid) {
    return null;
  }
  return zoned.toFormat(locale.startsWith('ja') ? 'yyyy/MM/dd' : 'MMM dd, yyyy');
}

function findNumericEvidence(text: string) {
  const matched = text.match(NUMERIC_EVIDENCE_PATTERN);
  return matched?.[1] ?? null;
}

export function buildSummaryEvidenceCards(report: AiReportResponse): SummaryEvidenceCard[] {
  return report.summary.highlights.slice(0, 3).map((highlight, index) => ({
    id: `evidence-${index}`,
    icon: EVIDENCE_ICONS[index % EVIDENCE_ICONS.length],
    text: highlight,
    emphasis: findNumericEvidence(highlight),
    tone: EVIDENCE_TONES[index % EVIDENCE_TONES.length],
  }));
}
