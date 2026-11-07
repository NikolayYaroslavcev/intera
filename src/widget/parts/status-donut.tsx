import type { ReactElement } from 'react';
import type { ISubscriptionUsageSummary } from '../subscription-usage-compute';
import {
  formatShare,
  pluralize,
  STATUS_META,
  SUBSCRIPTION_FORMS,
} from '../subscription-usage-format';
import type { TSubscriptionStatus } from '../subscription-usage-params';
import { el } from './class-names';

/** Clockwise order of the donut segments, starting at 12 o'clock. */
const SEGMENT_ORDER: readonly TSubscriptionStatus[] = [
  'normal',
  'warning',
  'critical',
  'no_data',
  'no_limit',
];

/** Gap between neighbouring segments, in percent of the circumference. */
const SEGMENT_GAP = 0.8;
const VIEWBOX = 100;
const RADIUS = 40;

export function statusCount(
  summary: ISubscriptionUsageSummary,
  status: TSubscriptionStatus,
): number {
  switch (status) {
    case 'no_data':
      return summary.noData;
    case 'no_limit':
      return summary.noLimit;
    default:
      return summary[status];
  }
}

interface IStatusDonutProps {
  summary: ISubscriptionUsageSummary;
  size: number;
}

/** `pathLength = 100` lets dash lengths be plain percentages. */
export function StatusDonut({ summary, size }: IStatusDonutProps): ReactElement {
  const total = summary.total;
  const segments = SEGMENT_ORDER.map((status) => ({
    status,
    share: total > 0 ? (statusCount(summary, status) / total) * 100 : 0,
  })).filter((segment) => segment.share > 0);
  const gap = segments.length > 1 ? SEGMENT_GAP : 0;

  let offset = 0;
  const label = [
    `${total} ${pluralize(total, SUBSCRIPTION_FORMS)}`,
    ...SEGMENT_ORDER.map(
      (status) =>
        `${STATUS_META[status].label}: ${statusCount(summary, status)} (${formatShare(statusCount(summary, status), total)})`,
    ),
  ].join(', ');

  return (
    <figure className={el('donut')} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} role="img" aria-label={label}>
        <circle className={el('donut-track')} cx="50" cy="50" r={RADIUS} pathLength={100} />
        {segments.map(({ status, share }) => {
          const length = Math.max(share - gap, 0.4);
          const circle = (
            <circle
              key={status}
              className={el('donut-segment')}
              data-status={status}
              cx="50"
              cy="50"
              r={RADIUS}
              pathLength={100}
              strokeDasharray={`${length} ${100 - length}`}
              strokeDashoffset={-offset}
            />
          );
          offset += share;
          return circle;
        })}
      </svg>
      <figcaption className={el('donut-center')} aria-hidden="true">
        <span className={el('donut-total')}>{total}</span>
        <span className={el('donut-caption')}>{pluralize(total, SUBSCRIPTION_FORMS)}</span>
      </figcaption>
    </figure>
  );
}
