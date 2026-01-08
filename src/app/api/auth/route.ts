import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

// 從環境變數取得 PIN 的 SHA-256 雜湊值
function getStoredPinHash(): string {
  const pin = process.env.APP_PIN;
  if (!pin) {
    throw new Error('APP_PIN 環境變數未設定');
  }
  // 在 server 端使用 Node.js crypto
  return createHash('sha256').update(pin).digest('hex');
}

// POST: 驗證 PIN 碼
export async function POST(request: NextRequest) {
  try {
    const { pin } = await request.json();
    
    if (!pin) {
      return NextResponse.json(
        { success: false, error: '請輸入 PIN 碼' },
        { status: 400 }
      );
    }

    // 計算輸入的 PIN 的雜湊值
    const inputHash = createHash('sha256').update(pin).digest('hex');
    const storedHash = getStoredPinHash();

    if (inputHash === storedHash) {
      // 回傳雜湊值讓前端儲存
      return NextResponse.json({
        success: true,
        token: inputHash,
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'PIN 碼錯誤' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('PIN verification error:', error);
    return NextResponse.json(
      { success: false, error: '驗證失敗' },
      { status: 500 }
    );
  }
}

// GET: 驗證 token 是否有效
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { success: false, authenticated: false },
        { status: 401 }
      );
    }

    const storedHash = getStoredPinHash();
    const isValid = token === storedHash;

    return NextResponse.json({
      success: true,
      authenticated: isValid,
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return NextResponse.json(
      { success: false, error: '驗證失敗' },
      { status: 500 }
    );
  }
}
