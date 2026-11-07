import { describe, expect, it } from 'vitest';
import mockData from '../data/mock-subscriptions.json';
import type { ISubscriptionRow } from '../types/subscription-list';
import {
  computeSubscriptionUsage,
  evaluateLimit,
  resolveDataLimit,
  type ISubscriptionUsageItem,
} from './subscription-usage-compute';
import { parseSubscriptionUsageParams } from './subscription-usage-params';

const fixture = mockData as ISubscriptionRow[];
const THRESHOLDS = { warningThreshold: 80, criticalThreshold: 100 };

/** A row with every limit unset; tests override only the fields they care about. */
function makeRow(overrides: Partial<ISubscriptionRow> = {}): ISubscriptionRow {
  return {
    subscription_id: 1,
    customer_id: 1,
    customer_code: 'C1',
    customer_name: 'Customer',
    item_type: 1,
    item_id: 1,
    item_number: 'IT-1',
    item_name: 'Terminal',
    vessel_id: 1,
    vessel_name: 'Vessel',
    contract_id: 1,
    contract_description: '',
    service_id: 1,
    product_name: 'Product',
    package_plan_id: null,
    package_plan_name: null,
    currency_id: 1,
    currency_name: 'USD',
    amount: 0,
    rebate: 0,
    date_start: '2026-01-01',
    date_end: null,
    subscription_active: 1,
    subscription_active_name: 'Active',
    technology_id: 12,
    technology_name: 'Iridium Certus',
    terminal_status: 1,
    terminal_status_name: 'Active',
    comments: null,
    allowance_period: '2026-10-01',
    allowance_minutes: 0,
    used_minutes: 0,
    allowance_mb: 0,
    used_mb: 0,
    allowance_gb: 0,
    used_gb: 0,
    allowance_money: 0,
    used_money: 0,
    ...overrides,
  };
}

function compute(rows: readonly ISubscriptionRow[], params: Record<string, unknown> = {}) {
  return computeSubscriptionUsage(rows, parseSubscriptionUsageParams(params));
}

function byId(items: readonly ISubscriptionUsageItem[], id: number) {
  const item = items.find((candidate) => candidate.row.subscription_id === id);
  if (!item) {
    throw new Error(`subscription ${id} not found`);
  }
  return item;
}

const ids = (items: readonly ISubscriptionUsageItem[]) =>
  items.map((item) => item.row.subscription_id);

describe('evaluateLimit', () => {
  it.each([null, undefined, '', 0, -1, '-1', 'abc'])(
    'allowance %j → no_limit with null percent',
    (allowance) => {
      const limit = evaluateLimit('voice', 'min', allowance, 50, THRESHOLDS);
      expect(limit.status).toBe('no_limit');
      expect(limit.allowance).toBeNull();
      expect(limit.usagePercent).toBeNull();
    },
  );

  it('keeps consumption of an unlimited dimension for display', () => {
    expect(evaluateLimit('voice', 'min', 0, 140, THRESHOLDS).used).toBe(140);
  });

  it.each([null, undefined, '', -1, 'n/a'])(
    'used %j with a positive allowance → no_data, never 0%',
    (used) => {
      const limit = evaluateLimit('data', 'MB', 250, used, THRESHOLDS);
      expect(limit.status).toBe('no_data');
      expect(limit.used).toBeNull();
      expect(limit.usagePercent).toBeNull();
    },
  );

  it('treats a real zero as 0% (normal)', () => {
    const limit = evaluateLimit('data', 'MB', 250, 0, THRESHOLDS);
    expect(limit.status).toBe('normal');
    expect(limit.usagePercent).toBe(0);
  });

  it.each([
    [79.99, 'normal'],
    [80, 'warning'],
    [99.99, 'warning'],
    [100, 'critical'],
    [135, 'critical'],
  ] as const)('%d%% → %s (thresholds are inclusive)', (used, status) => {
    expect(evaluateLimit('money', 'USD', 100, used, THRESHOLDS).status).toBe(status);
  });

  it('computes exact percents for integer inputs', () => {
    expect(evaluateLimit('data', 'GB', 500, 440, THRESHOLDS).usagePercent).toBe(88);
    expect(evaluateLimit('data', 'MB', 100, 80, THRESHOLDS).status).toBe('warning');
  });

  it('parses numeric strings', () => {
    const limit = evaluateLimit('data', 'MB', '30000', '25800', THRESHOLDS);
    expect(limit.allowance).toBe(30000);
    expect(limit.used).toBe(25800);
    expect(limit.usagePercent).toBe(86);
  });

  it('respects custom thresholds', () => {
    const custom = { warningThreshold: 50, criticalThreshold: 150 };
    expect(evaluateLimit('voice', 'min', 100, 120, custom).status).toBe('warning');
    expect(evaluateLimit('voice', 'min', 100, 150, custom).status).toBe('critical');
  });
});

describe('resolveDataLimit — GB vs MB', () => {
  it('uses GB when allowance_gb > 0, even when MB values are present', () => {
    const limit = resolveDataLimit(
      makeRow({ allowance_gb: 500, used_gb: 440, allowance_mb: 512000, used_mb: 450560 }),
      THRESHOLDS,
    );
    expect(limit).toMatchObject({ unit: 'GB', allowance: 500, used: 440, usagePercent: 88 });
  });

  it('uses GB when no allowance is positive but used_gb > 0', () => {
    const limit = resolveDataLimit(
      makeRow({ allowance_gb: -1, allowance_mb: 0, used_gb: 12, used_mb: 0 }),
      THRESHOLDS,
    );
    expect(limit).toMatchObject({ unit: 'GB', status: 'no_limit', used: 12 });
  });

  it('uses MB for a positive MB allowance', () => {
    const limit = resolveDataLimit(
      makeRow({ allowance_mb: 100, used_mb: 80, allowance_gb: 0, used_gb: 5 }),
      THRESHOLDS,
    );
    expect(limit).toMatchObject({ unit: 'MB', allowance: 100, used: 80, status: 'warning' });
  });

  it('falls back to MB when nothing is set', () => {
    const limit = resolveDataLimit(
      makeRow({ allowance_mb: null, used_mb: null, allowance_gb: null, used_gb: null }),
      THRESHOLDS,
    );
    expect(limit).toMatchObject({ unit: 'MB', status: 'no_limit', used: null });
  });

  it('reads GB values passed as strings', () => {
    const limit = resolveDataLimit(makeRow({ allowance_gb: '250', used_gb: '290' }), THRESHOLDS);
    expect(limit).toMatchObject({ unit: 'GB', usagePercent: 116, status: 'critical' });
  });
});

describe('computeSubscriptionUsage — overall status', () => {
  it('takes the worst enabled status: critical > warning > normal > no_data > no_limit', () => {
    const row = makeRow({
      allowance_mb: 100,
      used_mb: 50, // normal
      allowance_minutes: 100,
      used_minutes: 90, // warning
      allowance_money: 100,
      used_money: null, // no_data
    });
    const item = compute([row]).filteredItems[0];
    expect(item.overallStatus).toBe('warning');
    expect(item.primaryLimit.type).toBe('voice');
    expect(item.maxUsagePercent).toBe(90);
  });

  it('prefers no_data over no_limit', () => {
    const row = makeRow({ allowance_mb: 100, used_mb: null });
    expect(compute([row]).filteredItems[0].overallStatus).toBe('no_data');
  });

  it('ignores dimensions excluded from limitTypes', () => {
    const row = makeRow({
      allowance_mb: 100,
      used_mb: 40,
      allowance_minutes: 100,
      used_minutes: 135,
    });
    const item = compute([row], { limitTypes: ['data'] }).filteredItems[0];
    expect(item.overallStatus).toBe('normal');
    expect(item.maxUsagePercent).toBe(40);
    expect(item.primaryLimit.type).toBe('data');
    // The disabled dimension is still evaluated for the details view.
    expect(item.limits.voice.status).toBe('critical');
  });

  it('breaks equal statuses by the higher percent', () => {
    const row = makeRow({
      allowance_mb: 100,
      used_mb: 85,
      allowance_money: 100,
      used_money: 95,
    });
    expect(compute([row]).filteredItems[0].primaryLimit.type).toBe('money');
  });

  it('returns a null maxUsagePercent when no enabled dimension has a percent', () => {
    const item = compute([makeRow()]).filteredItems[0];
    expect(item.overallStatus).toBe('no_limit');
    expect(item.maxUsagePercent).toBeNull();
  });
});

describe('computeSubscriptionUsage — scope filters', () => {
  it('excludes inactive rows by default and includes them when onlyActive = false', () => {
    expect(compute(fixture).summary.total).toBe(21);
    expect(compute(fixture, { onlyActive: false }).summary.total).toBe(22);
  });

  it('treats an inactive row with null limits as no_limit when it is shown', () => {
    const item = byId(compute(fixture, { onlyActive: false }).filteredItems, 1044);
    expect(item.overallStatus).toBe('no_limit');
  });

  it('accepts subscription_active passed as a string', () => {
    const row = makeRow({ subscription_active: '1' as unknown as number });
    expect(compute([row]).summary.total).toBe(1);
  });

  it('filters by period prefix', () => {
    expect(compute(fixture, { period: '2026-10' }).summary.total).toBe(18);
    expect(compute(fixture, { period: '2026-09-15' }).summary.total).toBe(3);
    expect(compute(fixture, { period: '2025-01' }).summary.total).toBe(0);
  });

  it('drops rows without allowance_period when a period is selected', () => {
    const rows = [makeRow({ allowance_period: null })];
    expect(compute(rows, { period: '2026-10' }).summary.total).toBe(0);
    expect(compute(rows).summary.total).toBe(1);
  });

  it('filters by customer and technology', () => {
    const byCustomer = compute(fixture, { period: '2026-10', customerId: 214 });
    expect(ids(byCustomer.filteredItems).sort()).toEqual([1020, 1022]);

    const starlink = compute(fixture, { period: '2026-10', technologyIds: [83] });
    expect(starlink.filteredItems.every((item) => item.row.technology_id === 83)).toBe(true);
    expect(starlink.summary.total).toBe(6);
  });

  it('lists distinct periods of the raw dataset, newest first', () => {
    expect(compute(fixture, { customerId: 999 }).availablePeriods).toEqual([
      '2026-10',
      '2026-09',
    ]);
  });
});

describe('computeSubscriptionUsage — fixture edge cases (2026-10)', () => {
  const result = compute(fixture, { period: '2026-10' });

  it('marks exactly 80% as warning and exactly 100% as critical', () => {
    expect(byId(result.filteredItems, 1010).limits.data.status).toBe('warning');
    expect(byId(result.filteredItems, 1008).limits.data.status).toBe('critical');
  });

  it('handles string values from the external adapter', () => {
    const item = byId(result.filteredItems, 1024);
    expect(item.limits.data.usagePercent).toBe(86);
    expect(item.maxUsagePercent).toBe(94);
    expect(item.overallStatus).toBe('warning');
  });

  it('treats Enigma -1 sentinel as no limit', () => {
    expect(byId(result.filteredItems, 1020).limits.voice.status).toBe('no_limit');
  });

  it('reports a tariff without limits as no_limit', () => {
    expect(byId(result.filteredItems, 1022).overallStatus).toBe('no_limit');
  });

  it('flags money overrun on otherwise normal traffic', () => {
    const item = byId(result.filteredItems, 1026);
    expect(item.overallStatus).toBe('critical');
    expect(item.primaryLimit).toMatchObject({ type: 'money', unit: 'EUR', usagePercent: 120 });
  });

  it('builds the summary from overall statuses', () => {
    expect(result.summary).toMatchObject({
      total: 18,
      normal: 5,
      warning: 6,
      critical: 5,
      noData: 1,
      noLimit: 1,
    });
  });

  it('counts subscriptions (not units) per limit type', () => {
    expect(result.summary.byLimitType).toEqual({
      data: { withLimit: 17, warning: 6, critical: 3, noData: 1 },
      voice: { withLimit: 11, warning: 2, critical: 1, noData: 1 },
      money: { withLimit: 15, warning: 5, critical: 3, noData: 1 },
    });
  });

  it('leaves disabled dimensions out of byLimitType', () => {
    const dataOnly = compute(fixture, { period: '2026-10', limitTypes: ['data'] });
    expect(dataOnly.summary.byLimitType.voice).toEqual({
      withLimit: 0,
      warning: 0,
      critical: 0,
      noData: 0,
    });
  });
});

describe('computeSubscriptionUsage — status filter, search, sorting, rowLimit', () => {
  it('applies statusFilter to items but not to the summary', () => {
    const result = compute(fixture, { period: '2026-10', statusFilter: 'critical' });
    expect(result.summary.total).toBe(18);
    expect(result.filteredItems).toHaveLength(5);
    expect(result.filteredItems.every((item) => item.overallStatus === 'critical')).toBe(true);
  });

  it('lets the runtime status filter override the configured one', () => {
    const config = parseSubscriptionUsageParams({ period: '2026-10', statusFilter: 'critical' });
    const result = computeSubscriptionUsage(fixture, config, { statusFilter: 'all' });
    expect(result.filteredItems).toHaveLength(18);
  });

  it('slices visibleItems to rowLimit but keeps the full filteredItems', () => {
    const result = compute(fixture, { period: 'all' });
    expect(result.filteredItems).toHaveLength(21);
    expect(result.visibleItems).toHaveLength(10);
    expect(result.visibleItems).toEqual(result.filteredItems.slice(0, 10));
  });

  it.each([
    ['ocean', [1004]], // vessel "Ocean Star"
    ['океан', [1004, 1012, 1032]], // customer «Океан Сервис» + vessel «Тихий Океан»
    ['SL-884020', [1002]],
    ['certus 700', [1026]], // all tokens must match
    ['  КОРСАКОВ  ', [1034, 1036]],
    ['Морской VSAT', [1008, 1016, 1024, 1032]], // product_name
    ['нет-такого', []],
  ])('search %j → %j', (searchQuery, expected) => {
    const config = parseSubscriptionUsageParams({ period: '2026-10' });
    const result = computeSubscriptionUsage(fixture, config, { searchQuery });
    expect(ids(result.filteredItems).sort()).toEqual(expected);
    expect(result.summary.total).toBe(18);
  });

  it('folds ё into е when searching', () => {
    const row = makeRow({ customer_name: 'Семён и партнёры' });
    const result = computeSubscriptionUsage([row], parseSubscriptionUsageParams({}), {
      searchQuery: 'семен',
    });
    expect(result.filteredItems).toHaveLength(1);
  });

  it('sorts usage_desc with nulls last and ties by subscription_id', () => {
    const result = compute(fixture, { period: '2026-10' });
    const order = ids(result.filteredItems);
    expect(order.slice(0, 2)).toEqual([1004, 1034]);
    // 1024 and 1030 are both 94%: lower id first.
    expect(order.indexOf(1024)).toBeLessThan(order.indexOf(1030));
    expect(order.slice(-2)).toEqual([1018, 1022]);
  });

  it('sorts usage_asc with nulls still last', () => {
    const order = ids(compute(fixture, { period: '2026-10', sortBy: 'usage_asc' }).filteredItems);
    expect(order[0]).toBe(1036);
    expect(order.slice(-2)).toEqual([1018, 1022]);
  });

  it('sorts by customer_name, then by subscription_id', () => {
    const items = compute(fixture, { period: '2026-10', sortBy: 'customer_name' }).filteredItems;
    const names = items.map((item) => item.row.customer_name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'ru')));
    const arctic = items.filter((item) => item.row.customer_name === 'Арктик Транс');
    expect(ids(arctic)).toEqual([1002, 1010]);
  });

  it('returns empty results for empty input', () => {
    const result = compute([]);
    expect(result.summary.total).toBe(0);
    expect(result.filteredItems).toEqual([]);
    expect(result.availablePeriods).toEqual([]);
  });

  it('does not mutate the input rows', () => {
    const rows = fixture.map((row) => ({ ...row }));
    const snapshot = JSON.stringify(rows);
    compute(rows, { sortBy: 'customer_name' });
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});
