/** Labels and number formatting for the widget (ru-RU). */
import { formatPeriod } from '../platform/value-format';
import type { ILimitEvaluation } from './subscription-usage-compute';
import type {
  ISubscriptionUsageConfig,
  TLimitType,
  TSortMode,
  TSubscriptionStatus,
} from './subscription-usage-params';

const LOCALE = 'ru-RU';
const MAX_FRACTION_DIGITS = 2;

const amountFormat = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: MAX_FRACTION_DIGITS,
});
const percentFormat = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export interface IStatusMeta {
  /** Short status name used on badges and in the legend. */
  label: string;
  /** Human-readable explanation for tooltips and screen readers. */
  hint: string;
}

export const STATUS_META: Readonly<Record<TSubscriptionStatus, IStatusMeta>> = {
  critical: { label: 'Critical', hint: 'Лимит исчерпан или превышен' },
  warning: { label: 'Warning', hint: 'Расход приближается к лимиту' },
  normal: { label: 'Normal', hint: 'Расход в пределах нормы' },
  no_data: { label: 'No Data', hint: 'Лимит задан, но данных о расходе ещё нет' },
  no_limit: { label: 'No Limit', hint: 'Лимит не установлен' },
};

/** Status order for legends, chips and counters: from the worst to the most neutral. */
export const STATUS_DISPLAY_ORDER: readonly TSubscriptionStatus[] = [
  'critical',
  'warning',
  'normal',
  'no_data',
  'no_limit',
];

export const LIMIT_LABELS: Readonly<Record<TLimitType, string>> = {
  data: 'Трафик',
  voice: 'Голос',
  money: 'Деньги',
};

/** Unit hint for a dimension when units differ between subscriptions. */
export const LIMIT_UNIT_HINTS: Readonly<Record<TLimitType, string>> = {
  data: 'MB / GB',
  voice: 'минуты',
  money: 'в валюте подписки',
};

export const SORT_LABELS: Readonly<Record<TSortMode, string>> = {
  usage_desc: 'По расходу ↓',
  usage_asc: 'По расходу ↑',
  customer_name: 'По клиенту',
};

/** `135,0%`; `—` for a missing percent. */
export function formatPercent(value: number | null): string {
  if (value === null) {
    return '—';
  }
  // Normal rounding, except when it would land on a whole number from below:
  // 99.96% is still warning and must read 99,9%, not 100,0%.
  const rounded = Math.round(value * 10) / 10;
  const shown = Number.isInteger(rounded) && value < rounded ? rounded - 0.1 : rounded;
  return `${percentFormat.format(shown)}%`;
}

/** Share of a total as `31,3%` (`0,0%` for an empty total). */
export function formatShare(count: number, total: number): string {
  return formatPercent(total > 0 ? (count / total) * 100 : 0);
}

export function formatAmount(value: number): string {
  return amountFormat.format(value);
}

/** Display unit of a limit; an unknown currency is shown as `ед.` instead of an empty string. */
function unitOf(limit: ILimitEvaluation): string {
  return limit.unit || 'ед.';
}

/**
 * One-line description of a limit for tables and lists:
 * `1 350 / 1 000 min`, `Лимит 250 MB · нет данных`, `140 min · без лимита`, `Без лимита`.
 */
export function describeLimit(limit: ILimitEvaluation): string {
  const unit = unitOf(limit);
  switch (limit.status) {
    case 'no_limit':
      return limit.used !== null && limit.used > 0
        ? `${formatAmount(limit.used)} ${unit} · без лимита`
        : 'Без лимита';
    case 'no_data':
      return `Лимит ${formatAmount(limit.allowance ?? 0)} ${unit} · нет данных`;
    default:
      return `${formatAmount(limit.used ?? 0)} / ${formatAmount(limit.allowance ?? 0)} ${unit}`;
  }
}

/** Remaining amount (`осталось 60 GB`) or overrun (`перерасход 140 GB`) of a measured limit. */
export function describeRemainder(limit: ILimitEvaluation): string | null {
  if (limit.allowance === null || limit.used === null) {
    return null;
  }
  const diff = limit.allowance - limit.used;
  const unit = unitOf(limit);
  return diff >= 0
    ? `осталось ${formatAmount(diff)} ${unit}`
    : `перерасход ${formatAmount(-diff)} ${unit}`;
}

/** Threshold range for the legend, e.g. `80 – <100%`. */
export function statusRangeLabel(
  status: TSubscriptionStatus,
  config: Pick<ISubscriptionUsageConfig, 'warningThreshold' | 'criticalThreshold'>,
): string {
  const warning = formatAmount(config.warningThreshold);
  const critical = formatAmount(config.criticalThreshold);
  switch (status) {
    case 'critical':
      return `≥ ${critical}%`;
    case 'warning':
      return `${warning} – <${critical}%`;
    case 'normal':
      return `< ${warning}%`;
    default:
      return STATUS_META[status].hint;
  }
}

/**
 * Short description of the configured scope for the card subtitle:
 * `10.2026 · активные`, `Все периоды · Владивосток Карго`.
 */
export function describeScope(
  config: Pick<ISubscriptionUsageConfig, 'period' | 'onlyActive'>,
  customerName: string | null,
): string {
  const parts = [
    config.period === 'all' ? 'Все периоды' : formatPeriod(config.period, 'short'),
  ];
  if (customerName) {
    parts.push(customerName);
  }
  parts.push(config.onlyActive ? 'активные' : 'включая отключённые');
  return parts.join(' · ');
}

/** Russian plural form picker: `pluralize(5, ['подписка', 'подписки', 'подписок'])`. */
export function pluralize(count: number, forms: readonly [string, string, string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return forms[0];
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return forms[1];
  }
  return forms[2];
}

export const SUBSCRIPTION_FORMS = ['подписка', 'подписки', 'подписок'] as const;
