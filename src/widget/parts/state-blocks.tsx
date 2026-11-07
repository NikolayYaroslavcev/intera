import type { ReactElement, ReactNode } from 'react';
import type { TWidgetSize } from '../../platform/widget-types';
import { cx, el } from './class-names';

/** Roughly the height of each real layout, so the card does not jump after loading. */
const SKELETON_ROWS: Record<TWidgetSize, number> = {
  full: 5,
  half: 4,
  third: 4,
  quarter: 2,
};

/** Shown only before the first successful load, never instead of the empty state. */
export function WidgetSkeleton({ size }: { size: TWidgetSize }): ReactElement {
  const tiles = size === 'full' ? 4 : size === 'half' ? 3 : size === 'quarter' ? 1 : 0;
  return (
    <div className={el('skeleton')} role="status" aria-label="Загрузка подписок…">
      {tiles > 0 ? (
        <div className={el('skeleton-tiles')}>
          {Array.from({ length: tiles }, (_, index) => (
            <span key={index} className={cx(el('shimmer'), el('skeleton-tile'))} />
          ))}
        </div>
      ) : null}
      {size === 'third' || size === 'full' ? (
        <span className={cx(el('shimmer'), el('skeleton-ring'))} />
      ) : null}
      {Array.from({ length: SKELETON_ROWS[size] }, (_, index) => (
        <span key={index} className={cx(el('shimmer'), el('skeleton-line'))} />
      ))}
    </div>
  );
}

export function ErrorState({ message }: { message: string }): ReactElement {
  return (
    <div className={el('state')} data-tone="error" role="alert">
      <svg className={el('state-icon')} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.2v.3" />
      </svg>
      <p className={el('state-title')}>Не удалось загрузить подписки</p>
      <p className={el('state-message')}>{message}</p>
      <p className={el('state-text')}>Данные появятся после следующего успешного обновления источника.</p>
    </div>
  );
}

interface IEmptyStateProps {
  title: string;
  text?: string;
  action?: ReactNode;
  /** Inline variant for an empty table inside an otherwise filled card. */
  compact?: boolean;
}

export function EmptyState({ title, text, action, compact = false }: IEmptyStateProps): ReactElement {
  return (
    <div className={cx(el('state'), compact && el('state--compact'))} data-tone="empty" role="status">
      {compact ? null : (
        <svg className={el('state-icon')} viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5" width="16" height="14" rx="2.5" />
          <path d="M4 10h16M9 14.5h6" />
        </svg>
      )}
      <p className={el('state-title')}>{title}</p>
      {text ? <p className={el('state-text')}>{text}</p> : null}
      {action}
    </div>
  );
}
