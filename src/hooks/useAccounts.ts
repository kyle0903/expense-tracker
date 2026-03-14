'use client';

import { useAuthSWR } from './useSWRAuth';
import type { Account } from '@/types';

/**
 * SWR hook for accounts
 * 帳戶資料不常變動，使用較長的 dedup interval
 */
export function useAccounts() {
  const { data, error, isLoading, mutate } = useAuthSWR<Account[]>(
    '/api/accounts',
    { dedupingInterval: 60_000 }
  );

  return {
    accounts: data ?? [],
    isLoading,
    error,
    mutate,
  };
}
