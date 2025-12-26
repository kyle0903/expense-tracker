import { NextRequest, NextResponse } from 'next/server';
import { createTransaction } from '@/lib/notion';
import type { ApiResponse } from '@/types';

interface TransferRequest {
  fromAccount: string;
  toAccount: string;
  amount: number;
  date: string;
}

// POST: 帳戶間轉帳
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<{ fromId: string; toId: string }>>> {
  try {
    const body: TransferRequest = await request.json();
    
    // 驗證必填欄位
    if (!body.fromAccount || !body.toAccount || !body.amount || !body.date) {
      return NextResponse.json({
        success: false,
        error: '缺少必填欄位：來源帳戶、目標帳戶、金額、日期',
      }, { status: 400 });
    }

    if (body.fromAccount === body.toAccount) {
      return NextResponse.json({
        success: false,
        error: '來源和目標帳戶不能相同',
      }, { status: 400 });
    }

    if (body.amount <= 0) {
      return NextResponse.json({
        success: false,
        error: '轉帳金額必須大於 0',
      }, { status: 400 });
    }

    // 建立來源帳戶的交易記錄（支出）
    const fromId = await createTransaction({
      name: '轉帳',
      category: '轉帳',
      date: body.date,
      amount: -body.amount, // 負數表示支出
      account: body.fromAccount,
      note: `轉帳至 ${body.toAccount}`,
    });

    // 建立目標帳戶的交易記錄（收入）
    const toId = await createTransaction({
      name: '轉帳',
      category: '轉帳',
      date: body.date,
      amount: body.amount, // 正數表示收入
      account: body.toAccount,
      note: `來自 ${body.fromAccount}`,
    });

    return NextResponse.json({
      success: true,
      data: { fromId, toId },
    });
  } catch (error) {
    console.error('Failed to create transfer:', error);
    return NextResponse.json({
      success: false,
      error: '轉帳失敗',
    }, { status: 500 });
  }
}
