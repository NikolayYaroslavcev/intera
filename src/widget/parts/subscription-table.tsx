import { Fragment, useId, type ReactElement, type ReactNode } from 'react';
import type {
  ISubscriptionUsageItem,
  ISubscriptionUsageSummary,
} from '../subscription-usage-compute';
import {
  describeLimit,
  formatPercent,
  LIMIT_LABELS,
  SORT_LABELS,
  STATUS_DISPLAY_ORDER,
  STATUS_META,
} from '../subscription-usage-format';
import {
  SORT_MODES,
  type TLimitType,
  type TSortMode,
} from '../subscription-usage-params';
import type { IListControls } from '../use-list-controls';
import { cx, el } from './class-names';
import { LimitDetails } from './limit-details';
import { statusCount } from './status-donut';
import { StatusBadge } from './status-badge';
import { UsageBar } from './usage-bar';
import { EmptyState } from './state-blocks';

interface ISubscriptionToolbarProps {
  controls: IListControls;
  summary: ISubscriptionUsageSummary;
}

export function SubscriptionToolbar({ controls, summary }: ISubscriptionToolbarProps): ReactElement {
  const searchId = useId();
  const sortId = useId();
  return (
    <div className={el('toolbar')}>
      <div className={el('toolbar-row')}>
        <label className={el('search')} htmlFor={searchId}>
          <svg className={el('search-icon')} viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <span className={el('sr-only')}>Поиск подписок</span>
          <input
            id={searchId}
            type="search"
            className={el('search-input')}
            placeholder="Клиент, судно, терминал, продукт…"
            value={controls.searchQuery}
            onChange={(event) => controls.setSearchQuery(event.target.value)}
            autoComplete="off"
          />
        </label>
        <label className={el('sort')} htmlFor={sortId}>
          <span className={el('sr-only')}>Сортировка</span>
          <select
            id={sortId}
            className={el('sort-select')}
            value={controls.sortBy}
            onChange={(event) => controls.setSortBy(event.target.value as TSortMode)}
          >
            {SORT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {SORT_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={el('chips')} role="group" aria-label="Фильтр по статусу">
        <button
          type="button"
          className={el('chip')}
          aria-pressed={controls.statusFilter === 'all'}
          onClick={() => controls.setStatusFilter('all')}
        >
          Все <span className={el('chip-count')}>{summary.total}</span>
        </button>
        {STATUS_DISPLAY_ORDER.map((status) => (
          <button
            key={status}
            type="button"
            className={el('chip')}
            data-status={status}
            aria-pressed={controls.statusFilter === status}
            title={STATUS_META[status].hint}
            onClick={() => controls.setStatusFilter(status)}
          >
            <span className={el('dot')} data-status={status} aria-hidden="true" />
            {STATUS_META[status].label}{' '}
            <span className={el('chip-count')}>{statusCount(summary, status)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface ISubscriptionTableProps {
  items: readonly ISubscriptionUsageItem[];
  controls: IListControls;
  limitTypes: readonly TLimitType[];
  showDetails: boolean;
  footer?: ReactNode;
}

/** Subscription table with one primary limit per row and optional expandable details. */
export function SubscriptionTable({
  items,
  controls,
  limitTypes,
  showDetails,
  footer,
}: ISubscriptionTableProps): ReactElement {
  const detailsIdPrefix = useId();

  if (items.length === 0) {
    const query = controls.searchQuery.trim();
    return (
      <EmptyState
        compact
        title="Ничего не найдено"
        text={
          query
            ? `Нет подписок по запросу «${query}» с выбранным статусом.`
            : 'Нет подписок с выбранным статусом.'
        }
        action={
          <button type="button" className={el('link-button')} onClick={controls.resetFilters}>
            Сбросить поиск и фильтр
          </button>
        }
      />
    );
  }

  return (
    <div className={el('table-wrap')}>
      <table className={el('table')}>
        <thead>
          <tr>
            <th scope="col">Клиент / судно</th>
            <th scope="col" className={el('col-tech')}>
              Технология
            </th>
            <th scope="col">Макс. расход лимита</th>
            <th scope="col" className={el('col-num')}>
              %
            </th>
            {showDetails ? (
              <th scope="col" className={el('col-toggle')}>
                <span className={el('sr-only')}>Детали</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const { row, primaryLimit } = item;
            const expanded = showDetails && controls.expandedIds.has(row.subscription_id);
            const detailsId = `${detailsIdPrefix}-${row.subscription_id}`;
            const vesselLine = [row.vessel_name, row.item_number].filter(Boolean).join(' · ');
            return (
              <Fragment key={row.subscription_id}>
                <tr
                  className={cx(el('row'), showDetails && el('row--interactive'), expanded && el('row--expanded'))}
                  data-status={item.overallStatus}
                  onClick={showDetails ? () => controls.toggleExpanded(row.subscription_id) : undefined}
                >
                  <td>
                    {showDetails ? (
                      <button
                        type="button"
                        className={el('row-title')}
                        aria-expanded={expanded}
                        aria-controls={expanded ? detailsId : undefined}
                      >
                        {row.customer_name}
                      </button>
                    ) : (
                      <span className={el('row-title')}>{row.customer_name}</span>
                    )}
                    <span className={el('muted')}>{vesselLine}</span>
                    <span className={cx(el('muted'), el('tech-inline'))}>{row.technology_name}</span>
                  </td>
                  <td className={el('col-tech')}>
                    <span>{row.technology_name}</span>
                    <span className={el('muted')}>{row.product_name}</span>
                  </td>
                  <td className={el('col-usage')}>
                    <span className={el('usage-line')}>
                      <span className={el('usage-type')}>{LIMIT_LABELS[primaryLimit.type]}</span>
                      {describeLimit(primaryLimit)}
                    </span>
                    <UsageBar percent={primaryLimit.usagePercent} status={primaryLimit.status} />
                  </td>
                  <td className={el('col-num')}>
                    {item.maxUsagePercent === null ? (
                      <StatusBadge status={item.overallStatus} />
                    ) : (
                      <span className={el('percent')} data-status={item.overallStatus}>
                        {formatPercent(item.maxUsagePercent)}
                      </span>
                    )}
                  </td>
                  {showDetails ? (
                    <td className={el('col-toggle')}>
                      <svg className={el('chevron')} viewBox="0 0 16 16" aria-hidden="true">
                        <path d="m4 6 4 4 4-4" />
                      </svg>
                    </td>
                  ) : null}
                </tr>
                {expanded ? (
                  <tr className={el('details-row')}>
                    <td colSpan={5}>
                      <LimitDetails item={item} enabledTypes={limitTypes} id={detailsId} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {footer ? <div className={el('table-footer')}>{footer}</div> : null}
    </div>
  );
}
