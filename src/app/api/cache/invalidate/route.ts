import { NextRequest, NextResponse } from 'next/server';
import { cache, CACHE_KEYS } from '@/lib/cache';
import { verifyAuthHeader, unauthorizedResponse } from '@/lib/auth-middleware';

/**
 * 清除伺服器快取 API
 * 
 * 當外部系統（如發票爬蟲）更新 Notion 資料後，呼叫此 API 清除快取，
 * 確保下次讀取時會從 Notion 取得最新資料。
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    // 驗證認證
    if (!verifyAuthHeader(request)) {
        return unauthorizedResponse();
    }

    try {
        const body = await request.json().catch(() => ({}));
        const target = body.target || 'all';

        switch (target) {
            case 'transactions':
                cache.deletePattern(`${CACHE_KEYS.TRANSACTIONS}*`);
                break;
            case 'accounts':
                cache.delete(CACHE_KEYS.ACCOUNTS);
                break;
            case 'all':
            default:
                cache.clear();
                break;
        }

        return NextResponse.json({
            success: true,
            message: `快取已清除: ${target}`,
            stats: cache.stats(),
        });
    } catch (error) {
        console.error('Failed to invalidate cache:', error);
        return NextResponse.json({
            success: false,
            error: '快取清除失敗',
        }, { status: 500 });
    }
}
