import { toFiniteNumber } from '../platform/to-finite-number';
import type { ISubscriptionRow } from '../types/subscription-list';
import {
  LIMIT_TYPES,
  PERIOD_ALL,
  type ISubscriptionUsageConfig,
  type TLimitType,
  type TSortMode,
  type TStatusFilter,
  type TSubscriptionStatus,
} from './subscription-usage-params';

/** Evaluated metric for one limit dimension (`data`, `voice`, or `money`). */
export interface ILimitEvaluation {
  type: TLimitType;
  /** Display unit (`'GB' | 'MB'` for data, `'min'` for voice, `currency_name` for money). */
  unit: string;
  /** Positive tariff allowance, or `null` when no limit is set (`<= 0` or `null`). */
  allowance: number | null;
  /** Consumed amount, or `null` when missing/invalid (`null` or `< 0`). */
  used: number | null;
  /** `(used / allowance) * 100`, or `null` when `status` is `'no_limit'` or `'no_data'`. */
  usagePercent: number | null;
  status: TSubscriptionStatus;
}

/** Processed subscription row with per-dimension evaluations and overall status. */
export interface ISubscriptionUsageItem {
  row: ISubscriptionRow;
  /** Evaluations keyed by limit dimension (`data`, `voice`, `money`). */
  limits: Record<TLimitType, ILimitEvaluation>;
  /** Worst status across the dimensions enabled in `config.limitTypes`. */
  overallStatus: TSubscriptionStatus;
  /** Highest numeric `usagePercent` across enabled dimensions (`null` if none have numeric usage). */
  maxUsagePercent: number | null;
  /** The enabled limit evaluation that produced `overallStatus` / `maxUsagePercent`. */
  primaryLimit: ILimitEvaluation;
}

/** Per-dimension subscription counts. Amounts in different units or currencies are never summed. */
export interface ILimitTypeSummary {
  /** Subscriptions with a positive allowance in this dimension. */
  withLimit: number;
  warning: number;
  critical: number;
  noData: number;
}

/** Summary counts across all subscriptions matching the scope filters (before `statusFilter` and `rowLimit` cut). */
export interface ISubscriptionUsageSummary {
  total: number;
  normal: number;
  warning: number;
  critical: number;
  noData: number;
  noLimit: number;
  /**
   * Warning and critical counts broken down by limit dimension (never summing different units/currencies).
   * Dimensions excluded from `config.limitTypes` stay at zero.
   */
  byLimitType: Record<TLimitType, ILimitTypeSummary>;
}

/**
 * Interactive UI filter overrides (search query, quick filters inside the widget).
 * Each defined field takes precedence over the matching `config` value.
 */
export interface ISubscriptionRuntimeFilter {
  /** Free-text search; every whitespace-separated token must match one of the searchable fields. */
  searchQuery?: string;
  /** Quick status filter chosen in the widget; overrides `config.statusFilter`. */
  statusFilter?: TStatusFilter;
  /** Sort order chosen in the widget; overrides `config.sortBy`. */
  sortBy?: TSortMode;
}

export interface ISubscriptionUsageResult {
  /** Summary statistics for the scoped dataset. */
  summary: ISubscriptionUsageSummary;
  /** Filtered and sorted items (before `rowLimit` slicing). */
  filteredItems: ISubscriptionUsageItem[];
  /** Items sliced to `config.rowLimit` for table display. */
  visibleItems: ISubscriptionUsageItem[];
  /** Distinct available `YYYY-MM` periods in the raw dataset (sorted descending). */
  availablePeriods: string[];
}

export interface IUsageThresholds {
  warningThreshold: number;
  criticalThreshold: number;
}

/** Severity rank: a higher number is a worse status. */
export const STATUS_SEVERITY: Readonly<Record<TSubscriptionStatus, number>> = {
  no_limit: 0,
  no_data: 1,
  normal: 2,
  warning: 3,
  critical: 4,
};

/** Enigma technology id of Starlink, the only tariff family billed in GB. */
export const STARLINK_TECHNOLOGY_ID = 83;

const VOICE_UNIT = 'min';
const ACTIVE_SUBSCRIPTION = 1;
const PERIOD_PREFIX_LENGTH = 7;
const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const SEARCH_LOCALE = 'ru-RU';

/**
 * Classifies one limit dimension.
 *
 * - `allowance` missing or `<= 0` (incl. Enigma's `-1` sentinel) → `'no_limit'`.
 * - `allowance > 0` but `used` missing or negative → `'no_data'` (missing usage is never `0%`).
 * - Otherwise the percent is compared with the thresholds (`>=` is inclusive at both bounds).
 *
 * Percent is `used * 100 / allowance` rather than `(used / allowance) * 100`: same value, but exact
 * for integers (440 / 500 gives 88, not 88.00000000000001), which matters right at a threshold.
 */
export function evaluateLimit(
  type: TLimitType,
  unit: string,
  rawAllowance: unknown,
  rawUsed: unknown,
  thresholds: IUsageThresholds,
): ILimitEvaluation {
  const allowanceValue = toFiniteNumber(rawAllowance);
  const usedValue = toFiniteNumber(rawUsed);
  const allowance =
    allowanceValue !== null && allowanceValue > 0 ? allowanceValue : null;
  const used = usedValue !== null && usedValue >= 0 ? usedValue : null;

  if (allowance === null) {
    return { type, unit, allowance, used, usagePercent: null, status: 'no_limit' };
  }
  if (used === null) {
    return { type, unit, allowance, used, usagePercent: null, status: 'no_data' };
  }

  const usagePercent = (used * 100) / allowance;
  const status: TSubscriptionStatus =
    usagePercent >= thresholds.criticalThreshold
      ? 'critical'
      : usagePercent >= thresholds.warningThreshold
        ? 'warning'
        : 'normal';
  return { type, unit, allowance, used, usagePercent, status };
}

/**
 * Picks the traffic pair a subscription is billed in. Enigma exposes the same allowance column
 * in MB and in GB; exactly one pair applies, so the two are never added together.
 *
 * GB wins when `allowance_gb > 0`, or when neither allowance is positive but `used_gb > 0`
 * (a GB tariff without a cap). Every other case uses MB.
 */
export function resolveDataLimit(
  row: ISubscriptionRow,
  thresholds: IUsageThresholds,
): ILimitEvaluation {
  const allowanceGb = toFiniteNumber(row.allowance_gb);
  const allowanceMb = toFiniteNumber(row.allowance_mb);
  const usedGb = toFiniteNumber(row.used_gb);

  const hasGbLimit = allowanceGb !== null && allowanceGb > 0;
  const hasMbLimit = allowanceMb !== null && allowanceMb > 0;
  const useGb = hasGbLimit || (!hasMbLimit && usedGb !== null && usedGb > 0);

  return useGb
    ? evaluateLimit('data', 'GB', row.allowance_gb, row.used_gb, thresholds)
    : evaluateLimit('data', 'MB', row.allowance_mb, row.used_mb, thresholds);
}

export function evaluateLimits(
  row: ISubscriptionRow,
  thresholds: IUsageThresholds,
): Record<TLimitType, ILimitEvaluation> {
  return {
    data: resolveDataLimit(row, thresholds),
    voice: evaluateLimit(
      'voice',
      VOICE_UNIT,
      row.allowance_minutes,
      row.used_minutes,
      thresholds,
    ),
    money: evaluateLimit(
      'money',
      row.currency_name?.trim() || '',
      row.allowance_money,
      row.used_money,
      thresholds,
    ),
  };
}

/**
 * Chooses the enabled limit that defines the subscription: the worst status first, then the
 * higher percent, then the earlier position in `limitTypes`.
 */
function pickPrimaryLimit(
  limits: Record<TLimitType, ILimitEvaluation>,
  limitTypes: readonly TLimitType[],
): ILimitEvaluation {
  const enabled = limitTypes.length > 0 ? limitTypes : LIMIT_TYPES;
  let primary = limits[enabled[0]];
  for (const type of enabled.slice(1)) {
    const candidate = limits[type];
    const severityDiff =
      STATUS_SEVERITY[candidate.status] - STATUS_SEVERITY[primary.status];
    if (
      severityDiff > 0 ||
      (severityDiff === 0 &&
        (candidate.usagePercent ?? -Infinity) >
          (primary.usagePercent ?? -Infinity))
    ) {
      primary = candidate;
    }
  }
  return primary;
}

export function evaluateSubscription(
  row: ISubscriptionRow,
  config: Pick<
    ISubscriptionUsageConfig,
    'limitTypes' | 'warningThreshold' | 'criticalThreshold'
  >,
): ISubscriptionUsageItem {
  const limits = evaluateLimits(row, config);
  const primaryLimit = pickPrimaryLimit(limits, config.limitTypes);

  let maxUsagePercent: number | null = null;
  for (const type of config.limitTypes) {
    const percent = limits[type].usagePercent;
    if (percent !== null && (maxUsagePercent === null || percent > maxUsagePercent)) {
      maxUsagePercent = percent;
    }
  }

  return {
    row,
    limits,
    overallStatus: primaryLimit.status,
    maxUsagePercent,
    primaryLimit,
  };
}

/** Leading `YYYY-MM` of `allowance_period`, or `null` when missing or malformed. */
function periodOf(row: ISubscriptionRow): string | null {
  if (typeof row.allowance_period !== 'string') {
    return null;
  }
  const prefix = row.allowance_period.trim().slice(0, PERIOD_PREFIX_LENGTH);
  return PERIOD_REGEX.test(prefix) ? prefix : null;
}

function isInScope(row: ISubscriptionRow, config: ISubscriptionUsageConfig): boolean {
  if (config.onlyActive && toFiniteNumber(row.subscription_active) !== ACTIVE_SUBSCRIPTION) {
    return false;
  }
  if (config.period !== PERIOD_ALL && periodOf(row) !== config.period) {
    return false;
  }
  if (config.customerId !== 'all' && row.customer_id !== config.customerId) {
    return false;
  }
  if (
    config.technologyIds.length > 0 &&
    !config.technologyIds.includes(row.technology_id)
  ) {
    return false;
  }
  return true;
}

/** `ё` is folded into `е`, so «семен» finds «Семён». */
function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase(SEARCH_LOCALE).replace(/ё/g, 'е');
}

function searchableText(row: ISubscriptionRow): string {
  return normalizeSearchText(
    [
      row.customer_name,
      row.vessel_name,
      row.item_number,
      row.item_name,
      row.product_name,
    ]
      .filter((part): part is string => typeof part === 'string')
      .join('\n'),
  );
}

/** Splits a query into normalized tokens; an empty list means "no search". */
export function tokenizeSearchQuery(query: string | undefined): string[] {
  if (!query) {
    return [];
  }
  return normalizeSearchText(query).split(/\s+/).filter(Boolean);
}

function emptyLimitSummary(): ILimitTypeSummary {
  return { withLimit: 0, warning: 0, critical: 0, noData: 0 };
}

/** Counts statuses of scoped items. Only enabled dimensions contribute to `byLimitType`. */
function summarize(
  items: readonly ISubscriptionUsageItem[],
  limitTypes: readonly TLimitType[],
): ISubscriptionUsageSummary {
  const summary: ISubscriptionUsageSummary = {
    total: items.length,
    normal: 0,
    warning: 0,
    critical: 0,
    noData: 0,
    noLimit: 0,
    byLimitType: {
      data: emptyLimitSummary(),
      voice: emptyLimitSummary(),
      money: emptyLimitSummary(),
    },
  };

  for (const item of items) {
    switch (item.overallStatus) {
      case 'normal':
        summary.normal += 1;
        break;
      case 'warning':
        summary.warning += 1;
        break;
      case 'critical':
        summary.critical += 1;
        break;
      case 'no_data':
        summary.noData += 1;
        break;
      case 'no_limit':
        summary.noLimit += 1;
        break;
    }

    for (const type of limitTypes) {
      const limit = item.limits[type];
      const counters = summary.byLimitType[type];
      if (limit.status !== 'no_limit') {
        counters.withLimit += 1;
      }
      if (limit.status === 'warning') {
        counters.warning += 1;
      } else if (limit.status === 'critical') {
        counters.critical += 1;
      } else if (limit.status === 'no_data') {
        counters.noData += 1;
      }
    }
  }
  return summary;
}

const customerCollator = new Intl.Collator(SEARCH_LOCALE, { sensitivity: 'base' });

/**
 * Comparator for the given sort mode. With `usage_*` modes items without a numeric percent
 * always go last, whatever the direction; ties are broken by `subscription_id` ascending.
 */
function compareItems(sortBy: TSortMode) {
  return (a: ISubscriptionUsageItem, b: ISubscriptionUsageItem): number => {
    const byId = a.row.subscription_id - b.row.subscription_id;

    if (sortBy === 'customer_name') {
      return (
        customerCollator.compare(a.row.customer_name ?? '', b.row.customer_name ?? '') ||
        byId
      );
    }

    const pa = a.maxUsagePercent;
    const pb = b.maxUsagePercent;
    if (pa === null || pb === null) {
      if (pa === pb) {
        return byId;
      }
      return pa === null ? 1 : -1;
    }
    const byUsage = sortBy === 'usage_desc' ? pb - pa : pa - pb;
    return byUsage || byId;
  };
}

/**
 * Pure computation of subscription usage metrics, statuses, summary counters, filtering and sorting.
 *
 * Must NOT depend on React or DOM APIs.
 *
 * Key domain rules:
 * 1. Traffic unit (`data` limit): if `allowance_gb > 0` (or both allowances `<= 0` and `used_gb > 0`),
 *    use GB (`allowance_gb` / `used_gb`); otherwise use MB (`allowance_mb` / `used_mb`). Never sum MB and GB.
 * 2. Missing usage: if `allowance > 0` and `used` is `null` (or `< 0` / non-numeric), status is `'no_data'`
 *    and `usagePercent` is `null` — never treat missing usage as `0%`.
 * 3. No limit: if `allowance === null || allowance <= 0` (including Enigma's `-1` sentinel),
 *    status is `'no_limit'` and `usagePercent` is `null`.
 * 4. Overall status of a subscription is the worst status among `config.limitTypes` using the severity order:
 *    `'critical'` > `'warning'` > `'normal'` > `'no_data'` > `'no_limit'`.
 *
 * Order: scope filters (`onlyActive`, `period`, `customerId`, `technologyIds`), then `summary`,
 * then search, status filter, sort and the `rowLimit` slice. The summary does not change while
 * the user is searching or switching quick filters.
 */
export function computeSubscriptionUsage(
  rows: readonly ISubscriptionRow[],
  config: ISubscriptionUsageConfig,
  runtimeFilter?: ISubscriptionRuntimeFilter,
): ISubscriptionUsageResult {
  const periods = new Set<string>();
  const scoped: ISubscriptionUsageItem[] = [];

  for (const row of rows) {
    const period = periodOf(row);
    if (period !== null) {
      periods.add(period);
    }
    if (isInScope(row, config)) {
      scoped.push(evaluateSubscription(row, config));
    }
  }

  const summary = summarize(scoped, config.limitTypes);

  const statusFilter = runtimeFilter?.statusFilter ?? config.statusFilter;
  const sortBy = runtimeFilter?.sortBy ?? config.sortBy;
  const tokens = tokenizeSearchQuery(runtimeFilter?.searchQuery);

  const filteredItems = scoped
    .filter((item) => statusFilter === 'all' || item.overallStatus === statusFilter)
    .filter((item) => {
      if (tokens.length === 0) {
        return true;
      }
      const haystack = searchableText(item.row);
      return tokens.every((token) => haystack.includes(token));
    })
    .sort(compareItems(sortBy));

  return {
    summary,
    filteredItems,
    visibleItems: filteredItems.slice(0, config.rowLimit),
    availablePeriods: [...periods].sort().reverse(),
  };
}
