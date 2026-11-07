import { useCallback, useState } from 'react';
import type { TSortMode, TStatusFilter } from './subscription-usage-params';

/** Interactive list state of one widget instance: search, quick filters, expanded rows, dialog. */
export interface IListControls {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  statusFilter: TStatusFilter;
  setStatusFilter: (value: TStatusFilter) => void;
  sortBy: TSortMode;
  setSortBy: (value: TSortMode) => void;
  expandedIds: ReadonlySet<number>;
  toggleExpanded: (subscriptionId: number) => void;
  isListOpen: boolean;
  setListOpen: (open: boolean) => void;
  /** Clears the search and returns the quick filters to the configured values. */
  resetFilters: () => void;
}

/** State initialised from a param and reset when the param changes, without an effect. */
function useParamSeededState<T>(param: T): [T, (value: T) => void] {
  const [seed, setSeed] = useState(param);
  const [value, setValue] = useState(param);
  if (seed !== param) {
    setSeed(param);
    setValue(param);
  }
  return [value, setValue];
}

/**
 * Lives in the widget root, which stays mounted during a background refresh, so a refresh
 * keeps the search query, expanded rows and the open list.
 */
export function useListControls(
  configStatusFilter: TStatusFilter,
  configSortBy: TSortMode,
): IListControls {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useParamSeededState(configStatusFilter);
  const [sortBy, setSortBy] = useParamSeededState(configSortBy);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<number>>(() => new Set());
  const [isListOpen, setListOpen] = useState(false);

  const toggleExpanded = useCallback((subscriptionId: number) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (!next.delete(subscriptionId)) {
        next.add(subscriptionId);
      }
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter(configStatusFilter);
  }, [configStatusFilter, setStatusFilter]);

  return {
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    expandedIds,
    toggleExpanded,
    isListOpen,
    setListOpen,
    resetFilters,
  };
}
