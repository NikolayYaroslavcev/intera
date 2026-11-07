import type { ReactElement, ReactNode } from 'react';
import type {
  ISubscriptionUsageItem,
  ISubscriptionUsageSummary,
} from '../subscription-usage-compute';
import {
  describeLimit,
  formatAmount,
  formatPercent,
  formatShare,
  LIMIT_LABELS,
  LIMIT_UNIT_HINTS,
  STATUS_DISPLAY_ORDER,
  STATUS_META,
  statusRangeLabel,
} from '../subscription-usage-format';
import type {
  ISubscriptionUsageConfig,
  TLimitType,
  TStatusFilter,
  TSubscriptionStatus,
} from '../subscription-usage-params';
import { cx, el } from './class-names';
import { statusCount } from './status-donut';
import { UsageBar } from './usage-bar';

export type TTileTone = 'neutral' | 'warning' | 'critical';

interface IKpiTileProps {
  value: ReactNode;
  label: ReactNode;
  tone?: TTileTone;
  title?: string;
}

export function KpiTile({ value, label, tone = 'neutral', title }: IKpiTileProps): ReactElement {
  return (
    <div className={el('tile')} data-tone={tone} title={title}>
      <span className={el('tile-value')}>{value}</span>
      <span className={el('tile-label')}>{label}</span>
    </div>
  );
}

/** Total / Warning / Critical tiles, plus `No Data / No Limit` when `withNeutral` is set. */
export function KpiTiles({
  summary,
  config,
  withNeutral,
}: {
  summary: ISubscriptionUsageSummary;
  config: ISubscriptionUsageConfig;
  withNeutral: boolean;
}): ReactElement {
  const warning = formatAmount(config.warningThreshold);
  const critical = formatAmount(config.criticalThreshold);
  return (
    <div className={cx(el('tiles'), withNeutral && el('tiles--4'))}>
      <KpiTile value={summary.total} label={config.onlyActive ? 'Всего активных' : 'Всего подписок'} />
      <KpiTile value={summary.warning} label={`Warning ≥ ${warning}%`} tone="warning" />
      <KpiTile value={summary.critical} label={`Critical ≥ ${critical}%`} tone="critical" />
      {withNeutral ? (
        <KpiTile
          value={`${summary.noData} / ${summary.noLimit}`}
          label="No Data / No Limit"
          title="Нет данных о расходе / лимит не установлен"
        />
      ) : null}
    </div>
  );
}

interface IStatusLegendProps {
  summary: ISubscriptionUsageSummary;
  config: ISubscriptionUsageConfig;
  activeFilter?: TStatusFilter;
  /** When set, legend rows become buttons that apply the status as a quick filter. */
  onSelect?: (status: TSubscriptionStatus) => void;
  /** Merge `no_data` and `no_limit` into one row (compact sizes). */
  mergeNeutral?: boolean;
  withShare?: boolean;
}

export function StatusLegend({
  summary,
  config,
  activeFilter,
  onSelect,
  mergeNeutral = false,
  withShare = false,
}: IStatusLegendProps): ReactElement {
  const rows: Array<{ key: string; status: TSubscriptionStatus; label: string; hint: string; count: number }> =
    STATUS_DISPLAY_ORDER.filter((status) => !mergeNeutral || status !== 'no_limit').map((status) => {
      if (mergeNeutral && status === 'no_data') {
        return {
          key: 'neutral',
          status,
          label: 'No Data / No Limit',
          hint: 'Нет данных о расходе или лимит не установлен',
          count: summary.noData + summary.noLimit,
        };
      }
      return {
        key: status,
        status,
        label: STATUS_META[status].label,
        hint: statusRangeLabel(status, config),
        count: statusCount(summary, status),
      };
    });

  return (
    <ul className={el('legend')}>
      {rows.map((row) => {
        const content = (
          <>
            <span className={el('dot')} data-status={row.status} aria-hidden="true" />
            <span className={el('legend-label')}>
              {row.label}
              {withShare ? <span className={el('legend-hint')}>{row.hint}</span> : null}
            </span>
            <span className={el('legend-value')} data-status={row.status}>
              {row.count}
              {withShare ? (
                <span className={el('legend-share')}>{formatShare(row.count, summary.total)}</span>
              ) : null}
            </span>
          </>
        );
        return (
          <li key={row.key}>
            {onSelect ? (
              <button
                type="button"
                className={el('legend-row')}
                aria-pressed={activeFilter === row.status}
                title={`Показать только ${row.label}`}
                onClick={() => onSelect(row.status)}
              >
                {content}
              </button>
            ) : (
              <div className={el('legend-row')} title={row.hint}>
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Counts subscriptions per dimension, so MB and GB, USD and RUB are never added up. */
export function LimitTypeBreakdown({
  summary,
  limitTypes,
}: {
  summary: ISubscriptionUsageSummary;
  limitTypes: readonly TLimitType[];
}): ReactElement {
  return (
    <section className={el('section')} aria-label="Проблемные лимиты по типам">
      <h3 className={el('section-title')}>Проблемные лимиты по типам</h3>
      <ul className={el('breakdown')}>
        {limitTypes.map((type) => {
          const counters = summary.byLimitType[type];
          return (
            <li key={type} className={el('breakdown-row')}>
              <span className={el('breakdown-name')}>
                {LIMIT_LABELS[type]} <span className={el('muted')}>({LIMIT_UNIT_HINTS[type]})</span>
              </span>
              <span className={el('breakdown-counts')}>
                <span data-status="critical" className={el('count')} title="Critical">
                  {counters.critical} crit
                </span>
                <span data-status="warning" className={el('count')} title="Warning">
                  {counters.warning} warn
                </span>
                {counters.noData > 0 ? (
                  <span data-status="no_data" className={el('count')} title="Нет данных о расходе">
                    {counters.noData} no data
                  </span>
                ) : null}
                <span className={el('muted')} title="Подписок с установленным лимитом этого типа">
                  из {counters.withLimit}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function TopProblems({
  items,
  onOpen,
}: {
  items: readonly ISubscriptionUsageItem[];
  onOpen: (item: ISubscriptionUsageItem) => void;
}): ReactElement {
  return (
    <section className={el('section')} aria-label="Топ превышений">
      <h3 className={el('section-title')}>Топ превышений</h3>
      {items.length === 0 ? (
        <p className={el('all-good')}>
          <span className={el('dot')} data-status="normal" aria-hidden="true" />
          Все лимиты в пределах нормы
        </p>
      ) : (
        <ol className={el('top')}>
          {items.map((item) => (
            <li key={item.row.subscription_id}>
              <button type="button" className={el('top-item')} onClick={() => onOpen(item)}>
                <span className={el('top-head')}>
                  <span className={el('top-name')}>
                    {item.row.customer_name}
                    {item.row.vessel_name ? ` · ${item.row.vessel_name}` : ''}
                  </span>
                  <span className={el('percent')} data-status={item.overallStatus}>
                    {formatPercent(item.maxUsagePercent)}
                  </span>
                </span>
                <UsageBar percent={item.primaryLimit.usagePercent} status={item.primaryLimit.status} thin />
                <span className={el('muted')}>
                  {LIMIT_LABELS[item.primaryLimit.type]} · {describeLimit(item.primaryLimit)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function OpenListButton({ label, onClick }: { label: string; onClick: () => void }): ReactElement {
  return (
    <button type="button" className={el('cta')} onClick={onClick}>
      {label}
      <span aria-hidden="true">→</span>
    </button>
  );
}
