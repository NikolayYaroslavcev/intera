import { describe, expect, it } from 'vitest';
import { parseSubscriptionUsageParams } from './subscription-usage-params';

describe('parseSubscriptionUsageParams — defaults and robustness', () => {
  it.each([undefined, {}, { unknown: 1 }])('returns full defaults for %j', (params) => {
    expect(parseSubscriptionUsageParams(params)).toEqual({
      description: 'Subscription Usage',
      subtitle: '',
      size: 'full',
      period: 'all',
      customerId: 'all',
      technologyIds: [],
      onlyActive: true,
      limitTypes: ['data', 'voice', 'money'],
      warningThreshold: 80,
      criticalThreshold: 100,
      statusFilter: 'all',
      rowLimit: 10,
      showSummary: true,
      showDetails: true,
      sortBy: 'usage_desc',
    });
  });

  it('never throws on values of the wrong type', () => {
    const garbage = {
      description: 42,
      subtitle: { a: 1 },
      size: 'huge',
      period: 202610,
      customerId: { id: 1 },
      technologyIds: 'all',
      onlyActive: 'yes',
      limitTypes: 'data',
      warningThreshold: 'abc',
      criticalThreshold: null,
      statusFilter: 'broken',
      rowLimit: 'many',
      showSummary: 1,
      showDetails: null,
      sortBy: 'random',
    };
    expect(() => parseSubscriptionUsageParams(garbage)).not.toThrow();
    expect(parseSubscriptionUsageParams(garbage)).toEqual(
      parseSubscriptionUsageParams(undefined),
    );
  });
});

describe('parseSubscriptionUsageParams — texts', () => {
  it('trims description and falls back to title, then to the default', () => {
    expect(parseSubscriptionUsageParams({ description: '  Fleet  ' }).description).toBe('Fleet');
    expect(parseSubscriptionUsageParams({ description: '   ', title: ' Title ' }).description).toBe(
      'Title',
    );
    expect(parseSubscriptionUsageParams({ description: '', title: '' }).description).toBe(
      'Subscription Usage',
    );
  });

  it('trims subtitle', () => {
    expect(parseSubscriptionUsageParams({ subtitle: '  Enigma ' }).subtitle).toBe('Enigma');
  });
});

describe('parseSubscriptionUsageParams — scope filters', () => {
  it.each([
    ['2026-10', '2026-10'],
    ['2026-10-01', '2026-10'],
    [' 2026-09 ', '2026-09'],
    ['all', 'all'],
    ['2026-13', 'all'],
    ['2026-1', 'all'],
    ['202610', 'all'],
    ['', 'all'],
  ])('period %j → %j', (input, expected) => {
    expect(parseSubscriptionUsageParams({ period: input }).period).toBe(expected);
  });

  it.each([
    [214, 214],
    ['214', 214],
    [0, 'all'],
    [-5, 'all'],
    [Infinity, 'all'],
    [NaN, 'all'],
    ['', 'all'],
    [null, 'all'],
    ['all', 'all'],
  ])('customerId %j → %j', (input, expected) => {
    expect(parseSubscriptionUsageParams({ customerId: input }).customerId).toBe(expected);
  });

  it('keeps unique finite technology ids, accepting numeric strings', () => {
    expect(
      parseSubscriptionUsageParams({
        technologyIds: [83, '12', 83, null, '', 'x', NaN, Infinity, 16],
      }).technologyIds,
    ).toEqual([83, 12, 16]);
  });

  it('reads onlyActive as a strict boolean', () => {
    expect(parseSubscriptionUsageParams({ onlyActive: false }).onlyActive).toBe(false);
    expect(parseSubscriptionUsageParams({ onlyActive: 'false' }).onlyActive).toBe(true);
  });
});

describe('parseSubscriptionUsageParams — limit types', () => {
  it('keeps valid types in first-seen order without duplicates', () => {
    expect(
      parseSubscriptionUsageParams({ limitTypes: ['money', 'data', 'money', 'sms'] }).limitTypes,
    ).toEqual(['money', 'data']);
  });

  it.each([[[]], [['sms']], [null], ['data']])(
    'falls back to all three for %j',
    (limitTypes) => {
      expect(parseSubscriptionUsageParams({ limitTypes }).limitTypes).toEqual([
        'data',
        'voice',
        'money',
      ]);
    },
  );
});

describe('parseSubscriptionUsageParams — thresholds', () => {
  it('accepts a valid pair, including numeric strings', () => {
    const config = parseSubscriptionUsageParams({
      warningThreshold: '70',
      criticalThreshold: 90,
    });
    expect([config.warningThreshold, config.criticalThreshold]).toEqual([70, 90]);
  });

  it('clamps both thresholds to [1, 500]', () => {
    const config = parseSubscriptionUsageParams({
      warningThreshold: -20,
      criticalThreshold: 9000,
    });
    expect([config.warningThreshold, config.criticalThreshold]).toEqual([1, 500]);
  });

  it.each([
    [120, 90],
    [100, 100],
    [600, 700],
    [120, undefined],
    [undefined, 50],
  ])('resets to 80/100 when warning >= critical after clamping (%j, %j)', (w, c) => {
    const config = parseSubscriptionUsageParams({
      warningThreshold: w,
      criticalThreshold: c,
    });
    expect([config.warningThreshold, config.criticalThreshold]).toEqual([80, 100]);
  });

  it('keeps fractional thresholds', () => {
    const config = parseSubscriptionUsageParams({
      warningThreshold: 75.5,
      criticalThreshold: 99.9,
    });
    expect([config.warningThreshold, config.criticalThreshold]).toEqual([75.5, 99.9]);
  });
});

describe('parseSubscriptionUsageParams — enums and rowLimit', () => {
  it('reads valid size, statusFilter and sortBy', () => {
    const config = parseSubscriptionUsageParams({
      size: 'quarter',
      statusFilter: 'no_data',
      sortBy: 'customer_name',
    });
    expect([config.size, config.statusFilter, config.sortBy]).toEqual([
      'quarter',
      'no_data',
      'customer_name',
    ]);
  });

  it.each([
    [{ rowLimit: 25 }, 25],
    [{ rowLimit: '50' }, 50],
    [{ maxRows: 100 }, 100],
    [{ rowLimit: 25, maxRows: 100 }, 25],
    [{ rowLimit: 7, maxRows: 50 }, 50],
    [{ rowLimit: 7 }, 10],
    [{ maxRows: 0 }, 10],
  ])('rowLimit from %j → %d', (params, expected) => {
    expect(parseSubscriptionUsageParams(params).rowLimit).toBe(expected);
  });

  it('reads showSummary and showDetails', () => {
    const config = parseSubscriptionUsageParams({ showSummary: false, showDetails: false });
    expect([config.showSummary, config.showDetails]).toEqual([false, false]);
  });
});
