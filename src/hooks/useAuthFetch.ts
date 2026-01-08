'use client';

import { useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';

/**
 * 帶認證的 fetch hook
 * 自動在 header 加入 Authorization token
 */
export function useAuthFetch() {
  const { token } = useAuth();

  const authFetch = useCallback(async (
    url: string,
    options: RequestInit = {}
  ): Promise<Response> => {
    const headers = new Headers(options.headers);
    
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    
    return fetch(url, {
      ...options,
      headers,
    });
  }, [token]);

  return authFetch;
}
