import test from 'node:test';
import assert from 'node:assert/strict';
import { usePremiumStore } from '@/store/premium';

test('setStatus hydrates premium store and clears loading state', () => {
  const setStatus = usePremiumStore.getState().setStatus;
  const setLoading = usePremiumStore.getState().setLoading;
  const setError = usePremiumStore.getState().setError;

  setLoading(true);
  setError('failed');

  setStatus({
    isPremium: true,
    source: 'PURCHASE',
    daysRemaining: 365,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    grants: [
      {
        source: 'PURCHASE',
        days: 365,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      },
    ],
  });

  const state = usePremiumStore.getState();

  assert.equal(state.status?.isPremium, true);
  assert.equal(state.isLoading, false);
  assert.equal(state.error, null);
  assert.equal(state.status?.grants.length, 1);
});
