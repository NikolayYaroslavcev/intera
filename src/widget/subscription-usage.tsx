import { useDeferredValue, useMemo, type ReactElement, type ReactNode } from 'react';
import { FreshnessMark } from '../platform/freshness-mark';
import { WidgetHeader } from '../platform/widget-card';
import { widgetCardClass } from '../platform/widget-card-class';
import type { ICollectionDataResult, TWidgetSize } from '../platform/widget-types';
import type { ISubscriptionRow } from '../types/subscription-list';
import { cx, CLASS, el } from './parts/class-names';
import { ListDialog } from './parts/list-dialog';
import {
  FullView,
  HalfView,
  QuarterView,
  ThirdView,
  type ISizeViewProps,
} from './parts/size-views';
import { EmptyState, ErrorState, WidgetSkeleton } from './parts/state-blocks';
import { SubscriptionTable, SubscriptionToolbar } from './parts/subscription-table';
import {
  computeSubscriptionUsage,
  type ISubscriptionUsageItem,
} from './subscription-usage-compute';
import { describeScope, pluralize, SUBSCRIPTION_FORMS } from './subscription-usage-format';
import { parseSubscriptionUsageParams } from './subscription-usage-params';
import { useListControls } from './use-list-controls';
import './subscription-usage.css';

export interface ISubscriptionUsageWidgetProps {
  /** Raw widget configuration from dashboard YAML / parameter editor. */
  params?: Record<string, unknown>;
  /** Collection data envelope from INTERA runtime (`useCollectionData`). */
  data: ICollectionDataResult<ISubscriptionRow>;
  /** Optional explicit size override from the host container. */
  size?: TWidgetSize;
}

const SIZE_VIEWS: Record<TWidgetSize, (props: ISizeViewProps) => ReactElement> = {
  full: FullView,
  half: HalfView,
  third: ThirdView,
  quarter: QuarterView,
};

function isProblem(item: ISubscriptionUsageItem): boolean {
  return item.overallStatus === 'critical' || item.overallStatus === 'warning';
}

/**
 * Subscription usage widget for INTERA dashboards (`subscription-list` source of the Enigma integration).
 *
 * Layers: `parseSubscriptionUsageParams` (params → config) → `computeSubscriptionUsage` (pure domain
 * logic) → this component (data states, size layouts, interaction state).
 *
 * Data states:
 * - initial load (`loading && !loaded`) → skeleton, never the empty state;
 * - initial error (`error && !loaded`) → error block with `data.error`;
 * - background refresh (`loading && loaded`) → the current view stays mounted, so the search query,
 *   expanded rows and the open list survive; only a thin progress line is added;
 * - `stale` → `FreshnessMark` in the header switches to "Stale";
 * - empty source or empty scope → explicit empty states.
 */
export function SubscriptionUsageWidget({ params, data, size }: ISubscriptionUsageWidgetProps): ReactElement {
  const config = useMemo(() => parseSubscriptionUsageParams(params), [params]);
  const effectiveSize = size ?? config.size;
  const controls = useListControls(config.statusFilter, config.sortBy);
  const deferredQuery = useDeferredValue(controls.searchQuery);

  // Params filters only: summary and compact layouts must not follow the search box.
  const overview = useMemo(
    () => computeSubscriptionUsage(data.items, config, { statusFilter: 'all', sortBy: 'usage_desc' }),
    [data.items, config],
  );
  const listResult = useMemo(
    () =>
      computeSubscriptionUsage(data.items, config, {
        searchQuery: deferredQuery,
        statusFilter: controls.statusFilter,
        sortBy: controls.sortBy,
      }),
    [data.items, config, deferredQuery, controls.statusFilter, controls.sortBy],
  );
  const problems = useMemo(() => overview.filteredItems.filter(isProblem), [overview]);

  const customerName = useMemo(() => {
    if (config.customerId === 'all') {
      return null;
    }
    return data.items.find((row) => row.customer_id === config.customerId)?.customer_name ?? `#${config.customerId}`;
  }, [data.items, config.customerId]);
  const scopeLabel = describeScope(config, customerName);

  const isRefreshing = data.loading && data.loaded;
  const compact = effectiveSize === 'third' || effectiveSize === 'quarter';
  const { summary } = overview;

  // Compact cards start the list clean (openSubscription may have left a search behind).
  // In `full` the dialog continues the table the user is filtering, so filters stay.
  const openList = () => {
    if (effectiveSize !== 'full') {
      controls.resetFilters();
    }
    controls.setListOpen(true);
  };
  const openSubscription = (item: ISubscriptionUsageItem) => {
    controls.setSearchQuery(item.row.item_number || item.row.customer_name);
    controls.setStatusFilter('all');
    if (config.showDetails && !controls.expandedIds.has(item.row.subscription_id)) {
      controls.toggleExpanded(item.row.subscription_id);
    }
    controls.setListOpen(true);
  };

  let body: ReactNode;
  if (!data.loaded) {
    // Per spec, `error && !loaded` is an error state even while a retry is running.
    body =
      data.error !== null ? <ErrorState message={data.error} /> : <WidgetSkeleton size={effectiveSize} />;
  } else if (data.items.length === 0) {
    body = <EmptyState title="Нет подписок" text="Источник subscription-list не вернул ни одной записи." />;
  } else if (summary.total === 0) {
    body = (
      <EmptyState
        title="Нет подписок по параметрам"
        text={`Под фильтры виджета не попала ни одна подписка (${scopeLabel}).`}
      />
    );
  } else {
    const View = SIZE_VIEWS[effectiveSize];
    body = (
      <View
        config={config}
        summary={summary}
        problems={problems}
        listResult={listResult}
        controls={controls}
        openList={openList}
        openSubscription={openSubscription}
      />
    );
  }

  const aside =
    data.loaded || data.stale ? (
      <>
        {isRefreshing ? (
          <span className={el('refreshing')} role="status" aria-label="Обновление данных">
            <span className={el('spinner')} aria-hidden="true" />
            {compact ? null : 'Обновление'}
          </span>
        ) : null}
        <FreshnessMark
          source="rows"
          stale={data.stale}
          lastSuccessAt={data.lastSuccessAt}
          showLabel={!compact}
        />
      </>
    ) : null;

  const subtitle = compact
    ? config.subtitle
    : [config.subtitle, data.loaded ? scopeLabel : ''].filter(Boolean).join(' · ');

  return (
    <article
      className={cx(CLASS, widgetCardClass())}
      data-size={effectiveSize}
      aria-busy={data.loading}
    >
      {isRefreshing ? <span className={el('progress')} aria-hidden="true" /> : null}
      <WidgetHeader className={el('header')} title={config.description} subtitle={subtitle} aside={aside} />
      {data.loaded && data.error !== null ? (
        <p className={el('notice')} role="status" title={data.error}>
          Не удалось обновить данные, показан последний успешный результат.
        </p>
      ) : null}
      <div className={el('body')}>{body}</div>
      <ListDialog
        open={controls.isListOpen && data.loaded}
        onClose={() => controls.setListOpen(false)}
        title={config.description}
        subtitle={`${summary.total} ${pluralize(summary.total, SUBSCRIPTION_FORMS)} · ${scopeLabel}`}
      >
        <SubscriptionToolbar controls={controls} summary={summary} />
        <SubscriptionTable
          items={listResult.filteredItems}
          controls={controls}
          limitTypes={config.limitTypes}
          showDetails={config.showDetails}
          footer={
            <span className={el('muted')} aria-live="polite">
              Найдено {listResult.filteredItems.length} из {summary.total}
            </span>
          }
        />
      </ListDialog>
    </article>
  );
}
