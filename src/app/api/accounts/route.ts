import { NextRequest, NextResponse } from 'next/server';
import { getAccounts, createAccount, updateAccount } from '@/lib/notion';
import { verifyAuthHeader, unauthorizedResponse } from '@/lib/auth-middleware';
import type { Account, ApiResponse } from '@/types';

// GET: 查詢帳戶列表
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<Account[]>>> {
  // 驗證認證
  if (!verifyAuthHeader(request)) {
    return unauthorizedResponse();
  }

  try {
    const accounts = await getAccounts();

    return NextResponse.json({
      success: true,
      data: accounts,
    });
  } catch (error) {
    console.error('Failed to get accounts:', error);
    const errorMessage = error instanceof Error ? error.message : '未知錯誤';
    return NextResponse.json({
      success: false,
      error: `查詢帳戶失敗: ${errorMessage}`,
    }, { status: 500 });
  }
}

// POST: 新增帳戶
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<{ id: string }>>> {
  // 驗證認證
  if (!verifyAuthHeader(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();

    if (!body.name || !body.type) {
      return NextResponse.json({
        success: false,
        error: '缺少必填欄位：帳戶名稱、帳戶類型',
      }, { status: 400 });
    }

    const id = await createAccount({
      name: body.name,
      type: body.type,
      initialBalance: body.initialBalance || 0,
    });

    return NextResponse.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error('Failed to create account:', error);
    return NextResponse.json({
      success: false,
      error: '新增帳戶失敗',
    }, { status: 500 });
  }
}

// PUT: 更新帳戶
export async function PUT(request: NextRequest): Promise<NextResponse<ApiResponse<{ success: boolean }>>> {
  // 驗證認證
  if (!verifyAuthHeader(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({
        success: false,
        error: '缺少帳戶 ID',
      }, { status: 400 });
    }

    await updateAccount(id, updates);

    return NextResponse.json({
      success: true,
      data: { success: true },
    });
  } catch (error) {
    console.error('Failed to update account:', error);
    return NextResponse.json({
      success: false,
      error: '更新帳戶失敗',
    }, { status: 500 });
  }
}
