import type { ReactElement } from 'react';
import type { TSubscriptionStatus } from '../subscription-usage-params';
import { cx, el } from './class-names';

interface IUsageBarProps {
  /** Usage percent; `null` renders an empty track (no data / no limit). */
  percent: number | null;
  status: TSubscriptionStatus;
  thin?: boolean;
}

/**
 * Fill is capped at 100%, an overrun gets a hatched tail so 135% does not look like 100%.
 * Hidden from screen readers: the percent is always printed next to the bar.
 */
export function UsageBar({ percent, status, thin = false }: IUsageBarProps): ReactElement {
  const fill = percent === null ? 0 : Math.min(Math.max(percent, 0), 100);
  return (
    <span
      className={cx(el('bar'), thin && el('bar--thin'), percent !== null && percent > 100 && el('bar--over'))}
      data-status={status}
      aria-hidden="true"
    >
      <span className={el('bar-fill')} style={{ width: `${fill}%` }} />
    </span>
  );
}
