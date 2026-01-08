'use client';

import { getAuthToken } from '@/lib/auth';

/**
 * 帶認證的 fetch 函式
 * 自動在 header 加入 Authorization token
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getAuthToken();
  
  const headers = new Headers(options.headers);
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * 帶認證的 JSON fetch
 */
export async function authFetchJson<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await authFetch(url, options);
  return response.json();
}
