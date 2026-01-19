'use client';

import { useState, useEffect, useCallback } from 'react';

// Notion 發票記錄類型
interface NotionInvoice {
  id: string;
  日期: string;
  發票號碼: string;
  店家: string | null;
  金額: number;
  名稱: string;
  分類: string;
}

// 爬蟲同步結果類型
interface SyncResult {
  success: boolean;
  message: string;
  saved_count: number;
  skipped_count: number;
  saved_invoices?: SavedInvoice[];
}

interface SavedInvoice {
  日期: string;
  發票號碼: string;
  店家: string;
  金額: number;
  明細: string | null;
  名稱: string;
  分類: string;
  帳戶: string;
  備註: string;
}

// 進度狀態類型
interface ProgressState {
  current: number;
  total: number;
  stage: string;
  message: string;
}

// 爬蟲 API URL (Docker 容器)
const SCRAPER_API_URL = process.env.NEXT_PUBLIC_SCRAPER_API_URL || 'http://localhost:8000';

// 分類顏色對應
const categoryColors: Record<string, { bg: string; text: string }> = {
  '飲食': { bg: 'rgba(217, 160, 102, 0.15)', text: '#d9a066' },
  '交通': { bg: 'rgba(126, 181, 214, 0.15)', text: '#7eb5d6' },
  '購物': { bg: 'rgba(196, 144, 191, 0.15)', text: '#c490bf' },
  '居家': { bg: 'rgba(138, 177, 125, 0.15)', text: '#8ab17d' },
  '娛樂': { bg: 'rgba(232, 180, 180, 0.15)', text: '#e8b4b4' },
  '醫療': { bg: 'rgba(157, 197, 187, 0.15)', text: '#9dc5bb' },
  '教育': { bg: 'rgba(184, 169, 201, 0.15)', text: '#b8a9c9' },
  '其他': { bg: 'rgba(168, 168, 168, 0.15)', text: '#a8a8a8' },
};

export default function InvoicesPage() {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [notionInvoices, setNotionInvoices] = useState<NotionInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [progress, setProgress] = useState<ProgressState | null>(null);

  // 是否正在忙碌中（同步中或載入中）
  const isBusy = syncing || loadingInvoices;

  // 取得 Notion 中的發票清單
  const fetchNotionInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const res = await fetch(`${SCRAPER_API_URL}/notion-invoices`);
      const data = await res.json();
      if (data.success) {
        setNotionInvoices(data.invoices);
      }
    } catch {
      // 靜默處理錯誤
    } finally {
      setLoadingInvoices(false);
    }
  }, []);

  // 呼叫爬蟲 API 同步發票到 Notion（使用 SSE 串流）
  const syncInvoicesToNotion = useCallback(async () => {
    // 如果已經在同步中，不重複觸發
    if (syncing) return;

    setSyncing(true);
    setSyncResult(null);
    setProgress(null);
    setLoadingInvoices(true);

    // 使用 EventSource 接收 SSE 串流
    const eventSource = new EventSource(`${SCRAPER_API_URL}/scrape-and-save-stream`);

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setProgress(data);
    });

    eventSource.addEventListener('result', (e) => {
      const data = JSON.parse(e.data);
      setSyncResult({
        success: data.success,
        message: data.message,
        saved_count: data.saved_count || 0,
        skipped_count: data.skipped_count || 0,
        saved_invoices: data.saved_invoices || [],
      });
      setProgress(null);
      setSyncing(false);
      eventSource.close();
      // 同步完成後取得發票清單
      fetchNotionInvoices();
    });

    eventSource.addEventListener('error', (e) => {
      // 嘗試解析錯誤資料
      try {
        const event = e as MessageEvent;
        if (event.data) {
          const data = JSON.parse(event.data);
          setSyncResult({
            success: false,
            message: data.message || '同步失敗',
            saved_count: data.saved_count || 0,
            skipped_count: data.skipped_count || 0,
          });
        } else {
          setSyncResult({
            success: false,
            message: '同步失敗，請確認爬蟲服務是否運行中',
            saved_count: 0,
            skipped_count: 0,
          });
        }
      } catch {
        setSyncResult({
          success: false,
          message: '同步失敗，請確認爬蟲服務是否運行中',
          saved_count: 0,
          skipped_count: 0,
        });
      }
      setProgress(null);
      setSyncing(false);
      eventSource.close();
      fetchNotionInvoices();
    });
  }, [syncing, fetchNotionInvoices]);

  // 進入頁面時自動同步
  useEffect(() => {
    syncInvoicesToNotion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 當頁面重新可見時，自動重新同步
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 頁面重新可見時，重新同步
        syncInvoicesToNotion();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [syncInvoicesToNotion]);

  // 格式化金額
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency: 'TWD',
      minimumFractionDigits: 0,
    }).format(Math.abs(amount));
  };

  // 格式化日期顯示
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // 取得當前月份
  const getCurrentMonth = () => {
    const now = new Date();
    return `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`;
  };

  // 計算總金額
  const totalAmount = notionInvoices.reduce((sum, inv) => sum + Math.abs(inv.金額), 0);

  return (
    <div className="invoices-page">
      {/* 頂部標題區 */}
      <header className="page-header">
        <div className="header-left">
          <h1>載具同步</h1>
          <span className="month-badge">{getCurrentMonth()}</span>
        </div>
        <button
          onClick={() => syncInvoicesToNotion()}
          className="btn-sync"
          disabled={isBusy}
        >
          <svg className="sync-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 16h5v5" />
          </svg>
          {syncing ? '同步中' : loadingInvoices ? '載入中' : '重新同步'}
        </button>
      </header>

      {/* 同步狀態卡片 */}
      <div className={`sync-card ${syncing ? 'syncing' : syncResult?.success ? 'success' : syncResult ? 'error' : ''}`}>
        {syncing ? (
          <>
            <div className="sync-animation">
              <div className="pulse-ring"></div>
              <div className="pulse-ring delay-1"></div>
              <div className="pulse-ring delay-2"></div>
              <div className="sync-center-icon">📲</div>
            </div>
            <p className="sync-text">
              {progress?.message || '正在從財政部同步發票'}
            </p>
            {progress && progress.total > 0 && (
              <div className="progress-container">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                  />
                </div>
                <span className="progress-text">
                  {progress.current} / {progress.total}
                </span>
              </div>
            )}
            {(!progress || progress.total === 0) && (
              <p className="sync-hint">請稍候...</p>
            )}
          </>
        ) : syncResult ? (
          <>
            <div className="result-badge">
              <span className="result-icon">{syncResult.success ? '✓' : '✕'}</span>
            </div>
            <p className="result-text">{syncResult.message}</p>
            {syncResult.success && (
              <div className="result-stats">
                <div className="stat-item">
                  <span className="stat-value">{syncResult.saved_count}</span>
                  <span className="stat-label">新增</span>
                </div>
                <div className="stat-divider"></div>
                <div className="stat-item">
                  <span className="stat-value">{syncResult.skipped_count}</span>
                  <span className="stat-label">已存在</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="sync-text">準備同步...</p>
        )}
      </div>

      {/* 發票清單區域 */}
      <section className="invoices-section">
        <div className="section-header">
          <h2>本月發票記錄</h2>
          <div className="section-meta">
            <span className="invoice-count">{notionInvoices.length} 筆</span>
            <span className="total-amount">{formatAmount(totalAmount)}</span>
          </div>
        </div>

        {loadingInvoices ? (
          <div className="loading-list">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton-card">
                <div className="skeleton-line title"></div>
                <div className="skeleton-line subtitle"></div>
              </div>
            ))}
          </div>
        ) : notionInvoices.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <p>本月尚無發票記錄</p>
          </div>
        ) : (
          <div className="invoice-list">
            {notionInvoices.map((inv) => {
              const categoryStyle = categoryColors[inv.分類] || categoryColors['其他'];
              return (
                <div key={inv.id} className="invoice-item">
                  <div className="invoice-date">{formatDate(inv.日期)}</div>
                  <div className="invoice-content">
                    <div className="invoice-main-row">
                      <span className="invoice-name">{inv.名稱}</span>
                      <span className="invoice-amount">-{formatAmount(inv.金額)}</span>
                    </div>
                    <div className="invoice-sub-row">
                      <span
                        className="invoice-category"
                        style={{
                          background: categoryStyle.bg,
                          color: categoryStyle.text
                        }}
                      >
                        {inv.分類}
                      </span>
                      <span className="invoice-number">{inv.發票號碼}</span>
                      {inv.店家 && <span className="invoice-seller">{inv.店家}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <style jsx>{`
        .invoices-page {
          padding-bottom: 100px;
        }

        /* 頂部標題 */
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .page-header h1 {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0;
          color: var(--text-primary);
        }

        .month-badge {
          font-size: 0.75rem;
          padding: 4px 10px;
          background: var(--bg-secondary);
          border-radius: 100px;
          color: var(--text-secondary);
        }

        .btn-sync {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: transparent;
          color: var(--text-secondary);
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .btn-sync:hover:not(:disabled) {
          color: var(--text-primary);
          background: var(--bg-hover);
        }

        .btn-sync:active:not(:disabled) {
          background: var(--bg-active);
        }

        .btn-sync:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-sync:disabled .sync-icon {
          animation: spin 1s linear infinite;
        }

        .sync-icon {
          width: 18px;
          height: 18px;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* 同步卡片 */
        .sync-card {
          background: var(--bg-secondary);
          border-radius: 16px;
          padding: 28px 20px;
          text-align: center;
          margin-bottom: 24px;
          border: 1px solid var(--border-light);
          transition: all 0.3s ease;
        }

        .sync-card.syncing {
          background: linear-gradient(135deg, #f8f7f4 0%, #f0efeb 100%);
        }

        .sync-card.success {
          background: linear-gradient(135deg, #f0f9f4 0%, #e6f4ec 100%);
          border-color: rgba(77, 147, 117, 0.2);
        }

        .sync-card.error {
          background: linear-gradient(135deg, #fef5f5 0%, #fce8e8 100%);
          border-color: rgba(194, 109, 94, 0.2);
        }

        /* 同步動畫 */
        .sync-animation {
          position: relative;
          width: 80px;
          height: 80px;
          margin: 0 auto 16px;
        }

        .pulse-ring {
          position: absolute;
          inset: 0;
          border: 2px solid var(--color-accent);
          border-radius: 50%;
          animation: pulse-expand 2s ease-out infinite;
          opacity: 0;
        }

        .pulse-ring.delay-1 {
          animation-delay: 0.5s;
        }

        .pulse-ring.delay-2 {
          animation-delay: 1s;
        }

        @keyframes pulse-expand {
          0% {
            transform: scale(0.5);
            opacity: 0.8;
          }
          100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }

        .sync-center-icon {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          animation: float 2s ease-in-out infinite;
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }

        .sync-text {
          font-size: 1rem;
          font-weight: 500;
          color: var(--text-primary);
          margin: 0 0 6px 0;
        }

        .sync-hint {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin: 0;
        }

        /* 進度條 */
        .progress-container {
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          width: 100%;
          max-width: 280px;
          margin-left: auto;
          margin-right: auto;
        }

        .progress-bar {
          width: 100%;
          height: 6px;
          background: var(--bg-tertiary);
          border-radius: 3px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--color-accent) 0%, #25df5dfa 100%);
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .progress-text {
          font-size: 0.75rem;
          color: var(--text-secondary);
          font-variant-numeric: tabular-nums;
        }

        /* 結果顯示 */
        .result-badge {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 12px;
        }

        .sync-card.success .result-badge {
          background: rgba(77, 147, 117, 0.15);
        }

        .sync-card.error .result-badge {
          background: rgba(194, 109, 94, 0.15);
        }

        .result-icon {
          font-size: 1.5rem;
          font-weight: 700;
        }

        .sync-card.success .result-icon {
          color: var(--color-income);
        }

        .sync-card.error .result-icon {
          color: var(--color-expense);
        }

        .result-text {
          font-size: 0.95rem;
          font-weight: 500;
          color: var(--text-primary);
          margin: 0 0 16px 0;
        }

        .result-stats {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 24px;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }

        .stat-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }

        .stat-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .stat-divider {
          width: 1px;
          height: 32px;
          background: var(--border-medium);
        }

        /* 發票清單區域 */
        .invoices-section {
          background: var(--bg-primary);
          border-radius: 16px;
          border: 1px solid var(--border-light);
          overflow: hidden;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 18px;
          border-bottom: 1px solid var(--border-light);
          background: var(--bg-secondary);
        }

        .section-header h2 {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .section-meta {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .invoice-count {
          font-size: 0.75rem;
          color: var(--text-secondary);
          padding: 3px 8px;
          background: var(--bg-tertiary);
          border-radius: 4px;
        }

        .total-amount {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--color-expense);
          font-variant-numeric: tabular-nums;
        }

        /* 發票列表 */
        .invoice-list {
          padding: 8px 0;
        }

        .invoice-item {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 12px 18px;
          transition: background 0.15s ease;
        }

        .invoice-item:hover {
          background: var(--bg-hover);
        }

        .invoice-date {
          font-size: 0.75rem;
          color: var(--text-secondary);
          font-weight: 500;
          min-width: 36px;
          padding-top: 3px;
        }

        .invoice-content {
          flex: 1;
          min-width: 0;
        }

        .invoice-main-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }

        .invoice-name {
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .invoice-amount {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--color-expense);
          font-variant-numeric: tabular-nums;
          margin-left: 12px;
          flex-shrink: 0;
        }

        .invoice-sub-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .invoice-category {
          font-size: 0.7rem;
          font-weight: 500;
          padding: 2px 8px;
          border-radius: 4px;
        }

        .invoice-number {
          font-size: 0.7rem;
          color: var(--text-tertiary);
          font-family: 'SF Mono', 'Fira Code', monospace;
        }

        .invoice-seller {
          font-size: 0.7rem;
          color: var(--text-tertiary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 120px;
        }

        /* 空狀態 */
        .empty-state {
          padding: 48px 20px;
          text-align: center;
        }

        .empty-icon {
          font-size: 2.5rem;
          margin-bottom: 12px;
          opacity: 0.5;
        }

        .empty-state p {
          font-size: 0.9rem;
          color: var(--text-secondary);
          margin: 0;
        }

        /* 載入骨架 */
        .loading-list {
          padding: 12px 18px;
        }

        .skeleton-card {
          padding: 14px 0;
          border-bottom: 1px solid var(--border-light);
        }

        .skeleton-card:last-child {
          border-bottom: none;
        }

        .skeleton-line {
          background: linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 4px;
        }

        .skeleton-line.title {
          height: 16px;
          width: 60%;
          margin-bottom: 8px;
        }

        .skeleton-line.subtitle {
          height: 12px;
          width: 40%;
        }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* 深色模式調整 */
        @media (prefers-color-scheme: dark) {
          .sync-card.syncing {
            background: linear-gradient(135deg, #252525 0%, #1f1f1f 100%);
          }

          .sync-card.success {
            background: linear-gradient(135deg, #1a2e23 0%, #152519 100%);
          }

          .sync-card.error {
            background: linear-gradient(135deg, #2e1a1a 0%, #251515 100%);
          }
        }
      `}</style>
    </div>
  );
}
