import { describe, expect, it } from 'vitest';
import { evaluateLimit } from './subscription-usage-compute';
import {
  describeLimit,
  describeRemainder,
  formatPercent,
  formatShare,
  pluralize,
  SUBSCRIPTION_FORMS,
} from './subscription-usage-format';

const THRESHOLDS = { warningThreshold: 80, criticalThreshold: 100 };
const nbsp = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

describe('formatPercent', () => {
  it.each([
    [135, '135,0%'],
    [88, '88,0%'],
    [99.96, '99,9%'], // still warning: must not read as 100%
    [79.96, '79,9%'],
    [80.1, '80,1%'],
    [81.666, '81,7%'], // regular rounding away from whole numbers
    [0, '0,0%'],
  ])('%d → %s', (value, expected) => {
    expect(nbsp(formatPercent(value))).toBe(expected);
  });

  it('renders a dash for a missing percent', () => {
    expect(formatPercent(null)).toBe('—');
  });
});

describe('describeLimit / describeRemainder', () => {
  it('describes a measured limit with its unit', () => {
    const limit = evaluateLimit('voice', 'min', 1000, 1350, THRESHOLDS);
    expect(nbsp(describeLimit(limit))).toBe('1 350 / 1 000 min');
    expect(nbsp(describeRemainder(limit) ?? '')).toBe('перерасход 350 min');
  });

  it('never prints 0 for missing usage', () => {
    const limit = evaluateLimit('data', 'MB', 250, null, THRESHOLDS);
    expect(describeLimit(limit)).toBe('Лимит 250 MB · нет данных');
    expect(describeRemainder(limit)).toBeNull();
  });

  it('shows consumption of an unlimited dimension', () => {
    expect(describeLimit(evaluateLimit('voice', 'min', 0, 140, THRESHOLDS))).toBe(
      '140 min · без лимита',
    );
    expect(describeLimit(evaluateLimit('voice', 'min', 0, 0, THRESHOLDS))).toBe('Без лимита');
  });
});

describe('formatShare / pluralize', () => {
  it('formats shares and survives an empty total', () => {
    expect(nbsp(formatShare(5, 16))).toBe('31,3%');
    expect(nbsp(formatShare(0, 0))).toBe('0,0%');
  });

  it.each([
    [1, 'подписка'],
    [3, 'подписки'],
    [5, 'подписок'],
    [11, 'подписок'],
    [21, 'подписка'],
    [112, 'подписок'],
  ])('%d %s', (count, form) => {
    expect(pluralize(count, SUBSCRIPTION_FORMS)).toBe(form);
  });
});
