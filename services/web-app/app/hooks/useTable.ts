import { useState } from 'react';
import { useAsyncFetcherSubmit } from './useAsyncFetcher';
import { useFetcher, useRevalidator } from 'react-router';

export type CookieColumns = Record<
  string,
  {
    label: string;
    value?: string;
    formatter?: (value: any) => any;
  }
>;

type Props<Row> = {
  rows: Row[];
};
export const useTable = <Row extends { id: string }>({ rows }: Props<Row>) => {
  const [selected, setSelected] = useState<string[]>([]);
  const fetcher = useFetcher();
  const isLoading = fetcher.state !== 'idle';

  const handleSelectAll = () => {
    setSelected((prev) =>
      prev.length === rows.length ? [] : rows.map((s) => s.id)
    );
  };

  const handleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleSort = async (field: string, direction: 'asc' | 'desc') =>
    fetcher.submit(
      {
        intent: 'updateFilters',
        key: 'sort',
        value: `${field}-${direction}`,
      },
      { method: 'POST' }
    );

  return {
    selected,
    setSelected,
    isLoading,
    handleSelectAll,
    handleSelect,
    handleSort,
  };
};
