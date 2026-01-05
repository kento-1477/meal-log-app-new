import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDeviceFingerprintId } from '@/services/device-fingerprint';

const STORAGE_PREFIX = 'review:chat-log:';
const MAX_RECENT_IDS = 10;
export const REVIEW_TRIGGER_COUNT = 3;
export const FREE_REVIEW_TRIGGER_COUNT = 2;

export type ReviewTrackerState = {
  count: number;
  recentLogIds: string[];
  pending: boolean;
  promptedAt: string | null;
};

export type ReviewPromptDecision = {
  shouldPrompt: boolean;
  state: ReviewTrackerState;
};

const DEFAULT_STATE: ReviewTrackerState = {
  count: 0,
  recentLogIds: [],
  pending: false,
  promptedAt: null,
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
  const pending = typeof state.pending === 'boolean' ? state.pending : false;
  const promptedAt = typeof state.promptedAt === 'string' ? state.promptedAt : null;

  return {
    count,
    recentLogIds,
    pending,
    promptedAt,
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
  triggerCount?: number;
}): Promise<ReviewPromptDecision> {
  const storageKey = await resolveStorageKey(params.userId);
  const state = await readState(storageKey);
  const triggerCount =
    typeof params.triggerCount === 'number' && Number.isFinite(params.triggerCount)
      ? Math.max(1, Math.floor(params.triggerCount))
      : REVIEW_TRIGGER_COUNT;

  if (state.recentLogIds.includes(params.logId)) {
    return { shouldPrompt: state.pending && !state.promptedAt, state };
  }

  const nextCount = state.count + 1;
  const nextRecentIds = [...state.recentLogIds, params.logId].slice(-MAX_RECENT_IDS);
  const eligible = nextCount >= triggerCount && !state.promptedAt;
  const nextState: ReviewTrackerState = {
    count: nextCount,
    recentLogIds: nextRecentIds,
    pending: state.pending || eligible,
    promptedAt: state.promptedAt,
  };

  await writeState(storageKey, nextState);
  return { shouldPrompt: nextState.pending && !nextState.promptedAt, state: nextState };
}

export async function markReviewPrompted(userId: number | null) {
  const storageKey = await resolveStorageKey(userId);
  const state = await readState(storageKey);
  if (state.promptedAt) {
    return;
  }
  const nextState: ReviewTrackerState = {
    ...state,
    pending: false,
    promptedAt: new Date().toISOString(),
  };
  await writeState(storageKey, nextState);
}
