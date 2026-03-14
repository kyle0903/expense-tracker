'use client';

import { useAuthSWR } from './useSWRAuth';
import type { Summary, Transaction } from '@/types';

interface SummaryData {
  monthly: Summary;
  yearly: Summary;
  transactions: Transaction[];
}

/**
 * SWR hook for summary data
 * 回傳月度摘要、年度摘要、以及月度交易列表（單一 API 呼叫）
 */
export function useSummary(year: number, month: number) {
  const key = `/api/summary?year=${year}&month=${month}`;

  const { data, error, isLoading, mutate } = useAuthSWR<SummaryData>(key, {
    dedupingInterval: 30_000,
  });

  return {
    summary: data ? { monthly: data.monthly, yearly: data.yearly } : null,
    transactions: data?.transactions ?? [],
    isLoading,
    error,
    mutate,
  };
}
