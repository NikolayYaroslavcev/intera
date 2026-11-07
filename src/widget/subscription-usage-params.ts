import {
  readBoolean,
  readEnum,
  readString,
} from '../platform/widget-param-readers';
import {
  WIDGET_ROW_LIMITS,
  WIDGET_SIZES,
  type TWidgetRowLimit,
  type TWidgetSize,
} from '../platform/widget-types';

export const LIMIT_TYPES = ['data', 'voice', 'money'] as const;
export type TLimitType = (typeof LIMIT_TYPES)[number];

export const SUBSCRIPTION_STATUSES = [
  'normal',
  'warning',
  'critical',
  'no_data',
  'no_limit',
] as const;
export type TSubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const STATUS_FILTERS = ['all', ...SUBSCRIPTION_STATUSES] as const;
export type TStatusFilter = (typeof STATUS_FILTERS)[number];

export const SORT_MODES = ['usage_desc', 'usage_asc', 'customer_name'] as const;
export type TSortMode = (typeof SORT_MODES)[number];

export const MIN_THRESHOLD_PERCENT = 1;
export const MAX_THRESHOLD_PERCENT = 500;
export const DEFAULT_WARNING_THRESHOLD = 80;
export const DEFAULT_CRITICAL_THRESHOLD = 100;
export const DEFAULT_ROW_LIMIT: TWidgetRowLimit = 10;
export const DEFAULT_DESCRIPTION = 'Subscription Usage';
export const PERIOD_ALL = 'all';
export const CUSTOMER_ALL = 'all';

/** `YYYY-MM` with a real month, optionally followed by anything (`-DD`, time, …). */
const PERIOD_PREFIX_REGEX = /^(\d{4}-(?:0[1-9]|1[0-2]))(?:$|-)/;

export interface ISubscriptionUsageConfig {
  /** Card header title (`params.description`, with fallback to `params.title` or `'Subscription Usage'`). */
  description: string;
  /** Optional card header subtitle (`params.subtitle`). */
  subtitle: string;
  /** Card width slot (`full` | `half` | `third` | `quarter`). */
  size: TWidgetSize;
  /**
   * Billing period filter: `'all'` or a normalized `YYYY-MM` prefix
   * (a `YYYY-MM-DD` param is cut to its leading `YYYY-MM`). Default: `'all'`.
   */
  period: string;
  /** Customer filter (`'all'` or a positive finite `customer_id`). Default: `'all'`. */
  customerId: number | 'all';
  /** Technology filter (`technology_id[]`, unique). Empty array means all technologies. */
  technologyIds: number[];
  /** When `true` (default), only rows with `subscription_active === 1` are included. */
  onlyActive: boolean;
  /** Active limit dimensions to evaluate (`data`, `voice`, `money`). Non-empty; defaults to all three. */
  limitTypes: TLimitType[];
  /** Warning threshold in percent (`1..500`, must be strictly less than `criticalThreshold`). Default: `80`. */
  warningThreshold: number;
  /** Critical threshold in percent (`1..500`, must be strictly greater than `warningThreshold`). Default: `100`. */
  criticalThreshold: number;
  /** Status filter applied to each subscription's overall status. Default: `'all'`. */
  statusFilter: TStatusFilter;
  /** Maximum rows displayed in the table (`10 | 25 | 50 | 100`, reads `rowLimit` or `maxRows`). Default: `10`. */
  rowLimit: TWidgetRowLimit;
  /** Whether to show summary counters / distribution. Default: `true`. */
  showSummary: boolean;
  /** Whether to allow opening / viewing per-subscription details. Default: `true`. */
  showDetails: boolean;
  /** Sort order for subscription rows. Default: `'usage_desc'`. */
  sortBy: TSortMode;
}

function readTrimmed(values: readonly unknown[], fallback: string): string {
  for (const value of values) {
    const text = readString(value).trim();
    if (text) {
      return text;
    }
  }
  return fallback;
}

/** `'all'` or the leading `YYYY-MM` of a valid period string; anything else is `'all'`. */
function readPeriod(value: unknown): string {
  const text = readString(value).trim();
  const match = PERIOD_PREFIX_REGEX.exec(text);
  return match ? match[1] : PERIOD_ALL;
}

/**
 * Numeric params are read strictly: Core validates params on save, so a string here means a
 * broken layout, and it falls back to the default instead of being guessed into a number.
 */
function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A positive finite id, else `'all'`. */
function readCustomerId(value: unknown): number | 'all' {
  const id = readFiniteNumber(value);
  return id !== null && id > 0 ? id : CUSTOMER_ALL;
}

/** Unique finite numbers from an array; a non-array is "no filter". */
function readTechnologyIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const ids = new Set<number>();
  for (const item of value) {
    const id = readFiniteNumber(item);
    if (id !== null) {
      ids.add(id);
    }
  }
  return [...ids];
}

/** Valid limit types in first-seen order without duplicates; empty or invalid means all three. */
function readLimitTypes(value: unknown): TLimitType[] {
  if (!Array.isArray(value)) {
    return [...LIMIT_TYPES];
  }
  const types = new Set<TLimitType>();
  for (const item of value) {
    if ((LIMIT_TYPES as readonly unknown[]).includes(item)) {
      types.add(item as TLimitType);
    }
  }
  return types.size > 0 ? [...types] : [...LIMIT_TYPES];
}

/** A finite number clamped to `[MIN_THRESHOLD_PERCENT, MAX_THRESHOLD_PERCENT]`, else `fallback`. */
function readThreshold(value: unknown, fallback: number): number {
  const threshold = readFiniteNumber(value);
  if (threshold === null) {
    return fallback;
  }
  return Math.min(
    MAX_THRESHOLD_PERCENT,
    Math.max(MIN_THRESHOLD_PERCENT, threshold),
  );
}

function toRowLimit(value: unknown): TWidgetRowLimit | null {
  const limit = readFiniteNumber(value);
  return (WIDGET_ROW_LIMITS as readonly number[]).includes(limit ?? NaN)
    ? (limit as TWidgetRowLimit)
    : null;
}

/** `params.rowLimit` when valid, else legacy `params.maxRows`, else the default. */
function readRowLimit(rowLimit: unknown, maxRows: unknown): TWidgetRowLimit {
  return toRowLimit(rowLimit) ?? toRowLimit(maxRows) ?? DEFAULT_ROW_LIMIT;
}

/**
 * Parses untyped widget `params` into a validated `ISubscriptionUsageConfig` with all defaults applied.
 *
 * Rules:
 * 1. Never throw on malformed or missing fields — fall back to defaults.
 * 2. `description`: trimmed `params.description` or `params.title`, fallback `'Subscription Usage'`.
 * 3. `warningThreshold` and `criticalThreshold`: clamp to `[1, 500]`. If after clamping
 *    `warningThreshold >= criticalThreshold`, reset both to `80` and `100`.
 * 4. `limitTypes`: keep only valid `TLimitType` values in unique order; if empty or invalid, fallback to `['data', 'voice', 'money']`.
 * 5. `rowLimit`: read `params.rowLimit` (or legacy `params.maxRows`); if not in `[10, 25, 50, 100]`, fallback to `10`.
 */
export function parseSubscriptionUsageParams(
  params: Record<string, unknown> | undefined,
): ISubscriptionUsageConfig {
  const p = params ?? {};

  let warningThreshold = readThreshold(
    p.warningThreshold,
    DEFAULT_WARNING_THRESHOLD,
  );
  let criticalThreshold = readThreshold(
    p.criticalThreshold,
    DEFAULT_CRITICAL_THRESHOLD,
  );
  if (warningThreshold >= criticalThreshold) {
    warningThreshold = DEFAULT_WARNING_THRESHOLD;
    criticalThreshold = DEFAULT_CRITICAL_THRESHOLD;
  }

  return {
    description: readTrimmed([p.description, p.title], DEFAULT_DESCRIPTION),
    subtitle: readString(p.subtitle).trim(),
    size: readEnum(p.size, WIDGET_SIZES, 'full'),
    period: readPeriod(p.period),
    customerId: readCustomerId(p.customerId),
    technologyIds: readTechnologyIds(p.technologyIds),
    onlyActive: readBoolean(p.onlyActive, true),
    limitTypes: readLimitTypes(p.limitTypes),
    warningThreshold,
    criticalThreshold,
    statusFilter: readEnum(p.statusFilter, STATUS_FILTERS, 'all'),
    rowLimit: readRowLimit(p.rowLimit, p.maxRows),
    showSummary: readBoolean(p.showSummary, true),
    showDetails: readBoolean(p.showDetails, true),
    sortBy: readEnum(p.sortBy, SORT_MODES, 'usage_desc'),
  };
}
