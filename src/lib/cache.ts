/**
 * Server-side 記憶體快取
 * 用於減少 Notion API 呼叫次數，提升頁面載入速度
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class MemoryCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private defaultTTL: number = Infinity; // 永不過期，只有在資料變更時才清除

  /**
   * 取得快取資料
   * @param key 快取鍵值
   * @param ttl 快取有效時間（毫秒）
   */
  get<T>(key: string, ttl: number = this.defaultTTL): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    
    if (!entry) {
      return null;
    }

    // 檢查是否過期
    if (Date.now() - entry.timestamp > ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * 設定快取資料
   */
  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * 清除特定快取
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * 清除符合 pattern 的快取（支援萬用字元 *）
   */
  deletePattern(pattern: string): void {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 清除所有快取
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 取得快取統計
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// 單例模式 - 在整個 Node.js 進程中共享
export const cache = new MemoryCache();

// 快取鍵值常數
export const CACHE_KEYS = {
  TRANSACTIONS: 'transactions',
  ACCOUNTS: 'accounts',
} as const;
