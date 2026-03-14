'use client';

import useSWR, { type SWRConfiguration } from 'swr';
import { useAuth } from '@/components/AuthProvider';
import { useCallback } from 'react';

/**
 * 建立帶認證的 SWR fetcher
 */
function useAuthFetcher() {
  const { token } = useAuth();

  return useCallback(async (url: string) => {
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, { headers });

    if (!res.ok) {
      throw new Error('API request failed');
    }

    const json = await res.json();

    if (!json.success) {
      throw new Error(json.error || 'Unknown error');
    }

    return json.data;
  }, [token]);
}

/**
 * 帶認證的通用 SWR hook
 * 自動注入 Authorization token，預設關閉 revalidateOnFocus
 */
export function useAuthSWR<T>(
  key: string | null,
  config?: SWRConfiguration
) {
  const fetcher = useAuthFetcher();

  return useSWR<T>(key, fetcher, {
    revalidateOnFocus: false,
    ...config,
  });
}
