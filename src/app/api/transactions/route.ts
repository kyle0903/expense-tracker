import { NextRequest, NextResponse } from 'next/server';
import { createTransaction, getTransactions, updateTransaction, deleteTransaction } from '@/lib/notion';
import { verifyAuthHeader, unauthorizedResponse } from '@/lib/auth-middleware';
import type { Transaction, ApiResponse } from '@/types';

// POST: 新增交易記錄
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<{ id: string }>>> {
  // 驗證認證
  if (!verifyAuthHeader(request)) {
    return unauthorizedResponse();
  }

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
  // 驗證認證
  if (!verifyAuthHeader(request)) {
    return unauthorizedResponse();
  }

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

// PUT: 更新交易記錄
export async function PUT(request: NextRequest): Promise<NextResponse<ApiResponse<{ success: boolean }>>> {
  // 驗證認證
  if (!verifyAuthHeader(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { id, ...transaction } = body;

    if (!id) {
      return NextResponse.json({
        success: false,
        error: '缺少交易 ID',
      }, { status: 400 });
    }

    await updateTransaction(id, transaction);

    return NextResponse.json({
      success: true,
      data: { success: true },
    });
  } catch (error) {
    console.error('Failed to update transaction:', error);
    return NextResponse.json({
      success: false,
      error: '更新交易失敗',
    }, { status: 500 });
  }
}

// DELETE: 刪除交易記錄
export async function DELETE(request: NextRequest): Promise<NextResponse<ApiResponse<{ success: boolean }>>> {
  // 驗證認證
  if (!verifyAuthHeader(request)) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({
        success: false,
        error: '缺少交易 ID',
      }, { status: 400 });
    }

    await deleteTransaction(id);

    return NextResponse.json({
      success: true,
      data: { success: true },
    });
  } catch (error) {
    console.error('Failed to delete transaction:', error);
    return NextResponse.json({
      success: false,
      error: '刪除交易失敗',
    }, { status: 500 });
  }
}
