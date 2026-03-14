import { NextRequest, NextResponse } from 'next/server';
import { getSummaryWithTransactions } from '@/lib/notion';
import { verifyAuthHeader, unauthorizedResponse } from '@/lib/auth-middleware';
import type { Summary, Transaction, ApiResponse } from '@/types';

interface SummaryResponse {
  monthly: Summary;
  yearly: Summary;
  transactions: Transaction[];
}

// GET: 取得收支摘要（含月度交易列表）
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<SummaryResponse>>> {
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

    const result = await getSummaryWithTransactions(year, month);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Failed to get summary:', error);
    return NextResponse.json({
      success: false,
      error: '取得摘要失敗',
    }, { status: 500 });
  }
}
