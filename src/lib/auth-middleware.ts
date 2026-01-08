import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import type { ApiResponse } from '@/types';

/**
 * 驗證請求的 Authorization header
 * 用於保護 API 端點
 */
export function verifyAuthHeader(request: NextRequest): boolean {
  const pin = process.env.APP_PIN;
  
  // 如果沒有設定 PIN，跳過驗證（開發環境）
  if (!pin) {
    return true;
  }

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return false;
  }

  // 計算正確的雜湊值
  const correctHash = createHash('sha256').update(pin).digest('hex');
  
  return token === correctHash;
}

/**
 * 建立未授權回應（泛型版本）
 */
export function unauthorizedResponse<T>(): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    { success: false, error: '未授權，請先輸入 PIN 碼' } as ApiResponse<T>,
    { status: 401 }
  );
}
