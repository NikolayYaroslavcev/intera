// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import mockData from '../data/mock-subscriptions.json';
import type { ICollectionDataResult, TWidgetSize } from '../platform/widget-types';
import type { ISubscriptionRow } from '../types/subscription-list';
import { SubscriptionUsageWidget } from './subscription-usage';

const rows = mockData as ISubscriptionRow[];
const PARAMS = { period: '2026-10' };

function envelope(
  overrides: Partial<ICollectionDataResult<ISubscriptionRow>> = {},
): ICollectionDataResult<ISubscriptionRow> {
  return {
    items: rows,
    loading: false,
    loaded: true,
    error: null,
    stale: false,
    lastSuccessAt: '2026-10-24T10:15:00Z',
    ...overrides,
  };
}

const LOADING = envelope({ items: [], loading: true, loaded: false, lastSuccessAt: null });
const SIZES: TWidgetSize[] = ['full', 'half', 'third', 'quarter'];

afterEach(cleanup);

describe('SubscriptionUsageWidget — data states', () => {
  it.each(SIZES)('shows a skeleton, not the empty state, on initial load (%s)', (size) => {
    render(<SubscriptionUsageWidget params={PARAMS} data={LOADING} size={size} />);
    expect(screen.getByRole('status', { name: 'Загрузка подписок…' })).toBeTruthy();
    expect(screen.queryByText('Нет подписок')).toBeNull();
    expect(screen.getByRole('article').getAttribute('aria-busy')).toBe('true');
  });

  it('shows the error text when the first load fails', () => {
    const message = 'Enigma API request timed out after 15000 ms';
    render(
      <SubscriptionUsageWidget
        params={PARAMS}
        data={envelope({ items: [], loaded: false, error: message, lastSuccessAt: null })}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(message)).toBeTruthy();
  });

  it('keeps showing the error while a retry of the first load is in flight', () => {
    render(
      <SubscriptionUsageWidget
        params={PARAMS}
        data={envelope({ items: [], loaded: false, loading: true, error: 'timeout' })}
      />,
    );
    expect(within(screen.getByRole('alert')).getByText('timeout')).toBeTruthy();
  });

  it('keeps data on screen and adds a notice when a later refresh fails', () => {
    render(<SubscriptionUsageWidget params={PARAMS} data={envelope({ error: 'boom', stale: true })} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/показан последний успешный результат/)).toBeTruthy();
  });

  it('renders the Stale freshness mark for stale data', () => {
    render(<SubscriptionUsageWidget params={PARAMS} data={envelope({ stale: true })} />);
    expect(screen.getByText('Stale')).toBeTruthy();
  });

  it('distinguishes an empty source from an empty scope', () => {
    const { rerender } = render(
      <SubscriptionUsageWidget params={PARAMS} data={envelope({ items: [] })} />,
    );
    expect(screen.getByText('Нет подписок')).toBeTruthy();

    rerender(<SubscriptionUsageWidget params={{ period: '2024-01' }} data={envelope()} />);
    expect(screen.getByText('Нет подписок по параметрам')).toBeTruthy();
  });
});

describe('SubscriptionUsageWidget — sizes', () => {
  it('full: table limited by rowLimit, with summary tiles', () => {
    render(<SubscriptionUsageWidget params={PARAMS} data={envelope()} size="full" />);
    const table = screen.getByRole('table');
    // header row + 10 data rows
    expect(within(table).getAllByRole('row')).toHaveLength(11);
    expect(screen.getByText('Всего активных')).toBeTruthy();
    expect(screen.getByText('Показано 10 из 18')).toBeTruthy();
  });

  it('full: showSummary = false hides the tiles but keeps the table', () => {
    render(
      <SubscriptionUsageWidget
        params={{ ...PARAMS, showSummary: false }}
        data={envelope()}
        size="full"
      />,
    );
    expect(screen.queryByText('Всего активных')).toBeNull();
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('half: breakdown by limit type and top problems', () => {
    render(<SubscriptionUsageWidget params={PARAMS} data={envelope()} size="half" />);
    expect(screen.getByText('Проблемные лимиты по типам')).toBeTruthy();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Открыть полный список \(18\)/ })).toBeTruthy();
  });

  it('third: donut and merged no data / no limit counter', () => {
    render(<SubscriptionUsageWidget params={PARAMS} data={envelope()} size="third" />);
    expect(screen.getByRole('img', { name: /18 подписок/ })).toBeTruthy();
    expect(screen.getByText('No Data / No Limit')).toBeTruthy();
  });

  it('quarter: KPI and warning/critical badges', () => {
    render(<SubscriptionUsageWidget params={PARAMS} data={envelope()} size="quarter" />);
    expect(screen.getByText('18')).toBeTruthy();
    expect(screen.getByText('≥ 80% Warn')).toBeTruthy();
    expect(screen.getByText('≥ 100% Crit')).toBeTruthy();
  });
});

describe('SubscriptionUsageWidget — interaction survives background refresh', () => {
  it('keeps the search query and expanded row while loading && loaded', () => {
    const { rerender } = render(
      <SubscriptionUsageWidget params={PARAMS} data={envelope()} size="full" />,
    );

    const search = screen.getByRole('searchbox');
    act(() => {
      fireEvent.change(search, { target: { value: 'Ocean Star' } });
    });
    const toggle = screen.getByRole('button', { name: 'Океан Сервис' });
    act(() => {
      fireEvent.click(toggle);
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    rerender(
      <SubscriptionUsageWidget
        params={PARAMS}
        data={envelope({ loading: true })}
        size="full"
      />,
    );

    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('Ocean Star');
    expect(
      screen.getByRole('button', { name: 'Океан Сервис' }).getAttribute('aria-expanded'),
    ).toBe('true');
    expect(screen.getByRole('status', { name: 'Обновление данных' })).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Загрузка подписок…' })).toBeNull();
  });

  it('quick status chips filter the table but not the summary', () => {
    render(<SubscriptionUsageWidget params={PARAMS} data={envelope()} size="full" />);
    act(() => {
      const chips = screen.getByRole('group', { name: 'Фильтр по статусу' });
      fireEvent.click(within(chips).getByRole('button', { name: /^No Data/ }));
    });
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('Показано 1 из 1')).toBeTruthy();
    expect(screen.getByText('Всего активных').previousElementSibling?.textContent).toBe('18');
  });

  it('showDetails = false removes the row toggles', () => {
    render(
      <SubscriptionUsageWidget
        params={{ ...PARAMS, showDetails: false }}
        data={envelope()}
        size="full"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Океан Сервис' })).toBeNull();
  });

  it('a search set by a top-problem click does not leak into the next "open list"', () => {
    render(<SubscriptionUsageWidget params={PARAMS} data={envelope()} size="half" />);
    act(() => {
      fireEvent.click(screen.getAllByRole('button', { name: /Океан Сервис/ })[0]);
    });
    expect(within(screen.getByRole('dialog')).getByText('Найдено 1 из 18')).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Открыть полный список/ }));
    });
    expect(within(screen.getByRole('dialog')).getByText('Найдено 18 из 18')).toBeTruthy();
  });

  it('compact sizes open the full list in a dialog', () => {
    render(<SubscriptionUsageWidget params={PARAMS} data={envelope()} size="quarter" />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Детали/ }));
    });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('table')).toBeTruthy();
    expect(within(dialog).getByText('Найдено 18 из 18')).toBeTruthy();
  });
});
