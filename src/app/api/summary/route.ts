import { NextRequest, NextResponse } from 'next/server';
import { getSummary } from '@/lib/notion';
import { cache, CACHE_KEYS } from '@/lib/cache';
import { verifyAuthHeader, unauthorizedResponse } from '@/lib/auth-middleware';
import type { Summary, ApiResponse } from '@/types';

// GET: 取得收支摘要
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<{ monthly: Summary; yearly: Summary }>>> {
  // 驗證認證
  if (!verifyAuthHeader(request)) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');

    const now = new Date();
    const year = yearParam ? parseInt(yearParam) : now.getFullYear();
    const month = monthParam ? parseInt(monthParam) : now.getMonth() + 1;

    // 快取鍵值
    const cacheKey = `summary:${year}:${month}`;
    
    // 嘗試從快取取得
    const cached = cache.get<{ monthly: Summary; yearly: Summary }>(cacheKey);
    if (cached) {
      return NextResponse.json({
        success: true,
        data: cached,
      });
    }

    const [monthly, yearly] = await Promise.all([
      getSummary(year, month),
      getSummary(year),
    ]);

    const data = { monthly, yearly };
    
    // 存入快取
    cache.set(cacheKey, data);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Failed to get summary:', error);
    return NextResponse.json({
      success: false,
      error: '取得摘要失敗',
    }, { status: 500 });
  }
}
