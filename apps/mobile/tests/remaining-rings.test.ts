import test from 'node:test';
import assert from 'node:assert/strict';
import { colors } from '../src/theme/colors.ts';
import {
  buildRingState,
  computeProgress,
  type RingInput,
} from '../src/features/dashboard/components/ringMath.ts';

const translate = (key: string, params: Record<string, string | number> = {}) => {
  switch (key) {
    case 'rings.no_target':
      return '目標未設定';
    case 'rings.left':
      return `${params.value} ${params.unit} 残り`;
    case 'rings.over':
      return `${params.value} ${params.unit} 超過`;
    case 'status.over':
      return '超過';
    case 'status.under':
      return '残り';
    case 'rings.accessible':
      return `${params.label} ${params.current} ${params.unit} / ${params.target} ${params.unit}、${params.delta} ${params.unit} ${params.status}`;
    case 'rings.accessibleNoTarget':
      return `${params.label} ${params.current} ${params.unit}、目標未設定`;
    default:
      return key;
  }
};

function makeRing(overrides: Partial<RingInput> = {}): RingInput {
  return {
    label: '炭水化物',
    current: 0,
    target: 0,
    unit: 'g',
    colorToken: 'ringCarb',
    ...overrides,
  };
}

test('ring state shows minimum arc when current is zero', () => {
  const ring = makeRing({ current: 0, target: 100 });
  const state = buildRingState(ring, translate);

  assert.equal(state.deltaText, '100 g 残り');
  assert.equal(state.status, 'left');
  assert.equal(state.progress, computeProgress(0, 100));
  assert.ok(state.progress > 0);
});

test('ring state rounds remaining grams correctly', () => {
  const ring = makeRing({ current: 61, target: 111 });
  const state = buildRingState(ring, translate);

  assert.equal(state.deltaText, '50 g 残り');
  assert.equal(state.status, 'left');
  assert.ok(Math.abs(state.progress - (61 / 111)) < 0.0001);
});

test('ring state handles high completion percentages', () => {
  const ring = makeRing({ current: 244, target: 276 });
  const state = buildRingState(ring, translate);

  assert.equal(state.deltaText, '32 g 残り');
  assert.equal(state.status, 'left');
  assert.ok(Math.abs(state.progress - (244 / 276)) < 0.0001);
});

test('ring state clamps over-consumption to full arc', () => {
  const ring = makeRing({ current: 120, target: 100 });
  const state = buildRingState(ring, translate);

  assert.equal(state.deltaText, '-20 g 超過');
  assert.equal(state.status, 'over');
  assert.equal(state.progress, 1);
});

test('ring state disables visuals when target is zero', () => {
  const ring = makeRing({ current: 0, target: 0 });
  const state = buildRingState(ring, translate);

  assert.equal(state.deltaText, '目標未設定');
  assert.equal(state.status, 'no-target');
  assert.equal(state.ringColor, colors.ringInactive);
  assert.equal(state.progress, 0);
});
