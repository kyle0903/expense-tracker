import { NextRequest, NextResponse } from 'next/server';
import { createTransaction, getTransactions, getSummary } from '@/lib/notion';
import type { Transaction, ApiResponse } from '@/types';

// POST: 新增交易記錄
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<{ id: string }>>> {
  try {
    const body: Transaction = await request.json();
    
    // 驗證必填欄位
    if (!body.name || !body.category || !body.date || body.amount === undefined || !body.account) {
      return NextResponse.json({
        success: false,
        error: '缺少必填欄位：名稱、分類、日期、金額、帳戶',
      }, { status: 400 });
    }

    const id = await createTransaction(body);
    
    return NextResponse.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error('Failed to create transaction:', error);
    return NextResponse.json({
      success: false,
      error: '新增交易失敗',
    }, { status: 500 });
  }
}

// GET: 查詢交易記錄
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<Transaction[]>>> {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const transactions = await getTransactions(startDate, endDate);
    
    return NextResponse.json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    console.error('Failed to get transactions:', error);
    return NextResponse.json({
      success: false,
      error: '查詢交易失敗',
    }, { status: 500 });
  }
}
