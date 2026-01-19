import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDeviceFingerprintId } from '@/services/device-fingerprint';

const STORAGE_PREFIX = 'review:chat-log:';
const MAX_RECENT_IDS = 10;
export const REVIEW_TRIGGER_COUNTS = [3, 20];
export const FREE_REVIEW_TRIGGER_COUNTS = [2, 20];
export const REVIEW_TRIGGER_COUNT = REVIEW_TRIGGER_COUNTS[0];
export const FREE_REVIEW_TRIGGER_COUNT = FREE_REVIEW_TRIGGER_COUNTS[0];

export type ReviewTrackerState = {
  count: number;
  recentLogIds: string[];
  pending: boolean;
  pendingCount: number | null;
  promptedAt: string | null;
  promptedCounts: number[];
};

export type ReviewPromptDecision = {
  shouldPrompt: boolean;
  state: ReviewTrackerState;
};

const DEFAULT_STATE: ReviewTrackerState = {
  count: 0,
  recentLogIds: [],
  pending: false,
  pendingCount: null,
  promptedAt: null,
  promptedCounts: [],
};

async function resolveStorageKey(userId: number | null): Promise<string> {
  if (typeof userId === 'number') {
    return `${STORAGE_PREFIX}user:${userId}`;
  }
  const deviceId = await getDeviceFingerprintId();
  return `${STORAGE_PREFIX}device:${deviceId}`;
}

function sanitizeState(raw: unknown): ReviewTrackerState {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_STATE };
  }
  const state = raw as Partial<ReviewTrackerState>;
  const count = typeof state.count === 'number' && Number.isFinite(state.count) ? state.count : 0;
  const recentLogIds = Array.isArray(state.recentLogIds)
    ? state.recentLogIds.filter((id) => typeof id === 'string')
    : [];
  const pendingCount =
    typeof state.pendingCount === 'number' && Number.isFinite(state.pendingCount)
      ? state.pendingCount
      : null;
  const pending = typeof state.pending === 'boolean' ? state.pending : false;
  const promptedAt = typeof state.promptedAt === 'string' ? state.promptedAt : null;
  const promptedCounts = Array.isArray(state.promptedCounts)
    ? state.promptedCounts.filter((value) => typeof value === 'number' && Number.isFinite(value))
    : [];

  return {
    count,
    recentLogIds,
    pending: pendingCount !== null ? true : pending,
    pendingCount,
    promptedAt,
    promptedCounts,
  };
}

async function readState(storageKey: string): Promise<ReviewTrackerState> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) {
      return { ...DEFAULT_STATE };
    }
    return sanitizeState(JSON.parse(raw));
  } catch (error) {
    console.warn('Failed to read review tracker state', error);
    return { ...DEFAULT_STATE };
  }
}

async function writeState(storageKey: string, state: ReviewTrackerState) {
  try {
    await AsyncStorage.setItem(storageKey, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to persist review tracker state', error);
  }
}

export async function getReviewTrackerState(userId: number | null): Promise<ReviewTrackerState> {
  const storageKey = await resolveStorageKey(userId);
  return readState(storageKey);
}

export async function recordChatLogSuccess(params: {
  logId: string;
  userId: number | null;
  triggerCounts?: number[];
}): Promise<ReviewPromptDecision> {
  const storageKey = await resolveStorageKey(params.userId);
  const state = await readState(storageKey);
  const triggerCounts = normalizeTriggerCounts(params.triggerCounts ?? REVIEW_TRIGGER_COUNTS);

  if (state.recentLogIds.includes(params.logId)) {
    return { shouldPrompt: state.pendingCount !== null || state.pending, state };
  }

  const nextCount = state.count + 1;
  const nextRecentIds = [...state.recentLogIds, params.logId].slice(-MAX_RECENT_IDS);
  const promptedCounts =
    state.promptedCounts.length > 0 || !state.promptedAt || triggerCounts.length === 0
      ? state.promptedCounts
      : [triggerCounts[0]];
  const eligibleTriggers = triggerCounts.filter(
    (count) => nextCount >= count && !promptedCounts.includes(count),
  );
  const pendingCount = state.pendingCount ?? eligibleTriggers[0] ?? null;
  const eligible = pendingCount !== null;
  const nextState: ReviewTrackerState = {
    count: nextCount,
    recentLogIds: nextRecentIds,
    pending: eligible,
    pendingCount,
    promptedAt: state.promptedAt,
    promptedCounts,
  };

  await writeState(storageKey, nextState);
  return { shouldPrompt: nextState.pending, state: nextState };
}

export async function markReviewPrompted(userId: number | null, promptedCount?: number | null) {
  const storageKey = await resolveStorageKey(userId);
  const state = await readState(storageKey);
  const resolvedPromptedCount =
    typeof promptedCount === 'number' && Number.isFinite(promptedCount)
      ? promptedCount
      : state.pendingCount;
  const nextState: ReviewTrackerState = {
    ...state,
    pending: false,
    pendingCount: null,
    promptedCounts:
      typeof resolvedPromptedCount === 'number'
        ? Array.from(new Set([...state.promptedCounts, resolvedPromptedCount]))
        : state.promptedCounts,
    promptedAt: new Date().toISOString(),
  };
  await writeState(storageKey, nextState);
}

function normalizeTriggerCounts(input: number[]) {
  return Array.from(
    new Set(
      input
        .map((value) => (Number.isFinite(value) ? Math.max(1, Math.floor(value)) : null))
        .filter((value): value is number => value !== null),
    ),
  ).sort((a, b) => a - b);
}
