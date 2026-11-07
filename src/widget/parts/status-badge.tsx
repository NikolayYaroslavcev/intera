import type { ReactElement } from 'react';
import { STATUS_META } from '../subscription-usage-format';
import type { TSubscriptionStatus } from '../subscription-usage-params';
import { el } from './class-names';

export function StatusBadge({ status }: { status: TSubscriptionStatus }): ReactElement {
  const meta = STATUS_META[status];
  return (
    <span className={el('badge')} data-status={status} title={meta.hint}>
      {meta.label}
    </span>
  );
}
