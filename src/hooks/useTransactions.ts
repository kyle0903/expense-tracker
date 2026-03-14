'use client';

import { useAuthSWR } from './useSWRAuth';
import type { Transaction } from '@/types';

/**
 * SWR hook for transactions filtered by month
 */
export function useTransactions(year: number, month: number) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  const key = `/api/transactions?startDate=${startDate}&endDate=${endDate}`;

  const { data, error, isLoading, mutate } = useAuthSWR<Transaction[]>(key, {
    dedupingInterval: 30_000,
  });

  return {
    transactions: data ?? [],
    isLoading,
    error,
    mutate,
  };
}
