import type { ReactElement } from 'react';
import type {
  ISubscriptionUsageItem,
  ISubscriptionUsageResult,
  ISubscriptionUsageSummary,
} from '../subscription-usage-compute';
import { formatAmount } from '../subscription-usage-format';
import type { ISubscriptionUsageConfig } from '../subscription-usage-params';
import type { IListControls } from '../use-list-controls';
import { el } from './class-names';
import { StatusDonut } from './status-donut';
import { SubscriptionTable, SubscriptionToolbar } from './subscription-table';
import {
  KpiTile,
  KpiTiles,
  LimitTypeBreakdown,
  OpenListButton,
  StatusLegend,
  TopProblems,
} from './summary-blocks';

export interface ISizeViewProps {
  config: ISubscriptionUsageConfig;
  /** Scope summary: independent of search and quick filters. */
  summary: ISubscriptionUsageSummary;
  /** Warning/critical subscriptions by usage, worst first (for compact layouts). */
  problems: readonly ISubscriptionUsageItem[];
  listResult: ISubscriptionUsageResult;
  controls: IListControls;
  openList: () => void;
  openSubscription: (item: ISubscriptionUsageItem) => void;
}

/** XL: tiles, donut with legend, toolbar and the table. */
export function FullView({ config, summary, listResult, controls, openList }: ISizeViewProps): ReactElement {
  const shown = listResult.visibleItems.length;
  const found = listResult.filteredItems.length;
  return (
    <>
      {config.showSummary ? (
        <>
          <KpiTiles summary={summary} config={config} withNeutral />
          <div className={el('distribution')}>
            <StatusDonut summary={summary} size={112} />
            <StatusLegend
              summary={summary}
              config={config}
              withShare
              activeFilter={controls.statusFilter}
              onSelect={(status) =>
                controls.setStatusFilter(controls.statusFilter === status ? 'all' : status)
              }
            />
          </div>
        </>
      ) : null}
      <SubscriptionToolbar controls={controls} summary={summary} />
      <SubscriptionTable
        items={listResult.visibleItems}
        controls={controls}
        limitTypes={config.limitTypes}
        showDetails={config.showDetails}
        footer={
          <>
            <span className={el('muted')} aria-live="polite">
              Показано {shown} из {found}
            </span>
            {found > shown ? (
              <button type="button" className={el('link-button')} onClick={openList}>
                Показать все ({found})
              </button>
            ) : null}
          </>
        }
      />
    </>
  );
}

/** L: compact tiles, problems per limit type, top-5 and a link to the full list. */
export function HalfView({ config, summary, problems, openList, openSubscription }: ISizeViewProps): ReactElement {
  return (
    <>
      {config.showSummary ? (
        <>
          <KpiTiles summary={summary} config={config} withNeutral={false} />
          <LimitTypeBreakdown summary={summary} limitTypes={config.limitTypes} />
        </>
      ) : null}
      <TopProblems items={problems.slice(0, 5)} onOpen={openSubscription} />
      <OpenListButton label={`Открыть полный список (${summary.total})`} onClick={openList} />
    </>
  );
}

/** M: donut with the total and per-status counters. */
export function ThirdView({ config, summary, openList }: ISizeViewProps): ReactElement {
  return (
    <>
      <div className={el('third-donut')}>
        <StatusDonut summary={summary} size={120} />
      </div>
      <StatusLegend summary={summary} config={config} mergeNeutral />
      <OpenListButton label="Список подписок" onClick={openList} />
    </>
  );
}

/** S: a big total and warning/critical badges. */
export function QuarterView({ config, summary, openList }: ISizeViewProps): ReactElement {
  return (
    <>
      <KpiTile value={summary.total} label={config.onlyActive ? 'активных подписок' : 'подписок'} />
      <div className={el('quarter-badges')}>
        <KpiTile
          value={summary.warning}
          label={`≥ ${formatAmount(config.warningThreshold)}% Warn`}
          tone="warning"
        />
        <KpiTile
          value={summary.critical}
          label={`≥ ${formatAmount(config.criticalThreshold)}% Crit`}
          tone="critical"
        />
      </div>
      <p className={el('quarter-neutral')} title="Нет данных о расходе / лимит не установлен">
        {summary.noData} No Data · {summary.noLimit} No Lim
      </p>
      <OpenListButton label="Детали" onClick={openList} />
    </>
  );
}
