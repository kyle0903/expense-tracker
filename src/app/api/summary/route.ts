import { NextRequest, NextResponse } from 'next/server';
import { getSummary } from '@/lib/notion';
import type { Summary, ApiResponse } from '@/types';

// GET: 取得收支摘要
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<{ monthly: Summary; yearly: Summary }>>> {
  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');

    const now = new Date();
    const year = yearParam ? parseInt(yearParam) : now.getFullYear();
    const month = monthParam ? parseInt(monthParam) : now.getMonth() + 1;

    const [monthly, yearly] = await Promise.all([
      getSummary(year, month),
      getSummary(year),
    ]);

    return NextResponse.json({
      success: true,
      data: { monthly, yearly },
    });
  } catch (error) {
    console.error('Failed to get summary:', error);
    return NextResponse.json({
      success: false,
      error: '取得摘要失敗',
    }, { status: 500 });
  }
}
