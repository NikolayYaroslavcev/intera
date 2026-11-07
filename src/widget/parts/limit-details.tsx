import type { ReactElement } from 'react';
import type { ISubscriptionUsageItem } from '../subscription-usage-compute';
import {
  describeLimit,
  describeRemainder,
  formatPercent,
  LIMIT_LABELS,
  STATUS_META,
} from '../subscription-usage-format';
import { LIMIT_TYPES, type TLimitType } from '../subscription-usage-params';
import { cx, el } from './class-names';
import { StatusBadge } from './status-badge';
import { UsageBar } from './usage-bar';

interface ILimitDetailsProps {
  item: ISubscriptionUsageItem;
  /** Dimensions that drive the overall status; the rest are shown dimmed for reference. */
  enabledTypes: readonly TLimitType[];
  id: string;
}

/** Expanded details of one subscription: all three limits plus contract and terminal facts. */
export function LimitDetails({ item, enabledTypes, id }: ILimitDetailsProps): ReactElement {
  const { row } = item;
  const facts: Array<[string, string | null]> = [
    ['Продукт', row.product_name],
    ['Тариф', row.package_plan_name],
    ['Терминал', [row.item_number, row.item_name].filter(Boolean).join(' · ')],
    ['Статус терминала', row.terminal_status_name],
    ['Подписка', `#${row.subscription_id} · ${row.subscription_active_name}`],
    ['Период', row.allowance_period],
    ['Договор', row.contract_description || null],
  ];

  return (
    <div className={el('details')} id={id}>
      <ul className={el('details-limits')}>
        {LIMIT_TYPES.map((type) => {
          const limit = item.limits[type];
          const enabled = enabledTypes.includes(type);
          const remainder = describeRemainder(limit);
          return (
            <li
              key={type}
              className={cx(el('details-limit'), !enabled && el('details-limit--off'))}
              data-status={limit.status}
            >
              <div className={el('details-limit-head')}>
                <span className={el('details-limit-name')}>{LIMIT_LABELS[type]}</span>
                {enabled ? (
                  <StatusBadge status={limit.status} />
                ) : (
                  <span className={el('muted')} title="Тип лимита отключён в параметрах виджета">
                    не учитывается
                  </span>
                )}
              </div>
              <div className={el('details-limit-value')}>
                <span>{describeLimit(limit)}</span>
                <span className={el('percent')} data-status={limit.status}>
                  {formatPercent(limit.usagePercent)}
                </span>
              </div>
              <UsageBar percent={limit.usagePercent} status={limit.status} thin />
              <span className={el('muted')}>{remainder ?? STATUS_META[limit.status].hint}</span>
            </li>
          );
        })}
      </ul>
      <dl className={el('details-facts')}>
        {facts
          .filter((fact): fact is [string, string] => Boolean(fact[1]))
          .map(([term, value]) => (
            <div key={term} className={el('details-fact')}>
              <dt>{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      {row.comments ? <p className={el('details-comment')}>{row.comments}</p> : null}
    </div>
  );
}
