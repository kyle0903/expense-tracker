import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { verifyAuthHeader, unauthorizedResponse } from '@/lib/auth-middleware';
import type { ApiResponse } from '@/types';

const execAsync = promisify(exec);

// 發票資料類型
interface Invoice {
  invoiceNumber: string;
  invoiceDate: string;
  sellerName: string;
  amount: number;
  details: string | null;
  emailDate: string;
  emailSubject: string;
}

interface InvoiceResponse {
  success: boolean;
  data?: Invoice[];
  count?: number;
  error?: string;
  details?: string;
}

// GET: 取得發票列表
export async function GET(request: NextRequest): Promise<NextResponse<InvoiceResponse>> {
  // 驗證認證
  if (!verifyAuthHeader(request)) {
    return unauthorizedResponse() as NextResponse<InvoiceResponse>;
  }

  try {
    const { searchParams } = new URL(request.url);
    const days = searchParams.get('days') || '120';
    
    // Python 腳本路徑
    const scriptDir = path.join(process.cwd(), 'invoice-scraper');
    const pythonPath = path.join(scriptDir, 'venv', 'Scripts', 'python.exe');
    const scriptPath = path.join(scriptDir, 'get_invoices.py');
    
    console.log('Executing:', pythonPath, scriptPath, days);
    
    // 執行 Python 腳本
    const { stdout, stderr } = await execAsync(
      `"${pythonPath}" "${scriptPath}" ${days}`,
      { 
        cwd: scriptDir,
        timeout: 60000, // 60 秒超時
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      }
    );
    
    if (stderr) {
      console.warn('Python stderr:', stderr);
    }
    
    // 解析 JSON 輸出
    const result: InvoiceResponse = JSON.parse(stdout);
    
    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error || '取得發票失敗',
        details: result.details,
      }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      data: result.data,
      count: result.count,
    });
    
  } catch (error) {
    console.error('Failed to get invoices:', error);
    
    // 檢查是否是 Python 執行錯誤
    if (error instanceof Error) {
      if (error.message.includes('ENOENT')) {
        return NextResponse.json({
          success: false,
          error: '找不到 Python 環境，請確認 invoice-scraper/venv 已建立',
        }, { status: 500 });
      }
      
      // 嘗試解析 Python 的 JSON 錯誤輸出
      const match = error.message.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const pythonError = JSON.parse(match[0]);
          return NextResponse.json({
            success: false,
            error: pythonError.error || '執行發票查詢失敗',
            details: pythonError.details,
          }, { status: 500 });
        } catch {
          // 無法解析，繼續使用原始錯誤
        }
      }
    }
    
    return NextResponse.json({
      success: false,
      error: '取得發票失敗',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
