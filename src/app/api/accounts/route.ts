import { NextRequest, NextResponse } from 'next/server';
import { getAccounts, createAccount } from '@/lib/notion';
import type { Account, ApiResponse } from '@/types';

// GET: 查詢帳戶列表
export async function GET(): Promise<NextResponse<ApiResponse<Account[]>>> {
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
