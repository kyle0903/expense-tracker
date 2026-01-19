import { NextRequest, NextResponse } from 'next/server';
import { getCarrierAccount, setCarrierAccount } from '@/lib/notion';
import { verifyAuthHeader, unauthorizedResponse } from '@/lib/auth-middleware';
import type { Account, ApiResponse } from '@/types';

// GET: 取得載具帳戶
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<Account | null>>> {
  if (!verifyAuthHeader(request)) {
    return unauthorizedResponse();
  }

  try {
    const carrierAccount = await getCarrierAccount();

    return NextResponse.json({
      success: true,
      data: carrierAccount,
    });
  } catch (error) {
    console.error('Failed to get carrier account:', error);
    const errorMessage = error instanceof Error ? error.message : '未知錯誤';
    return NextResponse.json({
      success: false,
      error: `取得載具帳戶失敗: ${errorMessage}`,
    }, { status: 500 });
  }
}

// PUT: 設定載具帳戶
export async function PUT(request: NextRequest): Promise<NextResponse<ApiResponse<{ success: boolean }>>> {
  if (!verifyAuthHeader(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json({
        success: false,
        error: '缺少帳戶 ID',
      }, { status: 400 });
    }

    await setCarrierAccount(accountId);

    return NextResponse.json({
      success: true,
      data: { success: true },
    });
  } catch (error) {
    console.error('Failed to set carrier account:', error);
    const errorMessage = error instanceof Error ? error.message : '未知錯誤';
    return NextResponse.json({
      success: false,
      error: `設定載具帳戶失敗: ${errorMessage}`,
    }, { status: 500 });
  }
}
