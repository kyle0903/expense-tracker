'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Summary, Transaction } from '@/types';

export default function SummaryPage() {
  const [summary, setSummary] = useState<{ monthly: Summary; yearly: Summary } | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // 使用 state 管理年月，允許切換
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [year, month] = selectedMonth.split('-').map(Number);

  // 載入資料
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 計算該月的日期範圍
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

      const [summaryRes, transactionsRes] = await Promise.all([
        fetch(`/api/summary?year=${year}&month=${month}`),
        fetch(`/api/transactions?startDate=${startDate}&endDate=${endDate}`),
      ]);

      const summaryData = await summaryRes.json();
      const transactionsData = await transactionsRes.json();

      if (summaryData.success) {
        setSummary(summaryData.data);
      }
      if (transactionsData.success) {
        setTransactions(transactionsData.data.slice(0, 10)); // 只顯示最近 10 筆
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 切換月份
  const changeMonth = (delta: number) => {
    const newDate = new Date(year, month - 1 + delta, 1);
    setSelectedMonth(
      `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`
    );
  };

  if (loading) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '60px 0',
        color: 'var(--text-tertiary)',
      }}>
        載入中...
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '80px' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ 
          fontSize: '1.5rem', 
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: 0,
        }}>
          摘要
        </h1>
      </header>

      {/* 月份選擇器 */}
      <div 
        className="card"
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          marginBottom: '20px',
          padding: '12px 16px',
        }}
      >
        <button
          onClick={() => changeMonth(-1)}
          className="btn btn-secondary"
          style={{ padding: '8px 12px', minWidth: 'auto' }}
        >
          ‹
        </button>
        <div style={{ fontWeight: 600, fontSize: '1rem' }}>
          {year} 年 {month} 月
        </div>
        <button
          onClick={() => changeMonth(1)}
          className="btn btn-secondary"
          style={{ padding: '8px 12px', minWidth: 'auto' }}
        >
          ›
        </button>
      </div>

      {/* 月度摘要 */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '12px',
        marginBottom: '20px',
      }}>
        <div className="card" style={{ background: 'var(--color-income-bg)' }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            本月收入
          </div>
          <div 
            className="amount amount-income animate-slide-up"
            style={{ fontSize: '1.5rem', marginTop: '4px' }}
          >
            +${summary?.monthly.totalIncome.toLocaleString() || 0}
          </div>
        </div>
        <div className="card" style={{ background: 'var(--color-expense-bg)' }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            本月支出
          </div>
          <div 
            className="amount amount-expense animate-slide-up"
            style={{ fontSize: '1.5rem', marginTop: '4px' }}
          >
            -${summary?.monthly.totalExpense.toLocaleString() || 0}
          </div>
        </div>
      </div>

      {/* 月度結餘 */}
      <div 
        className="card"
        style={{ marginBottom: '20px', background: 'var(--bg-secondary)' }}
      >
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          本月結餘
        </div>
        <div 
          className={`amount animate-slide-up ${
            (summary?.monthly.balance || 0) >= 0 ? 'amount-income' : 'amount-expense'
          }`}
          style={{ fontSize: '2rem', marginTop: '4px' }}
        >
          {(summary?.monthly.balance || 0) >= 0 ? '+' : ''}
          ${summary?.monthly.balance.toLocaleString() || 0}
        </div>
      </div>

      {/* 年度摘要 */}
      <div 
        className="card"
        style={{ marginBottom: '24px' }}
      >
        <div style={{ 
          fontSize: '0.875rem', 
          fontWeight: 600,
          marginBottom: '12px',
        }}>
          {year} 年度累計
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>收入</div>
            <div className="amount amount-income">
              +${summary?.yearly.totalIncome.toLocaleString() || 0}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>支出</div>
            <div className="amount amount-expense">
              -${summary?.yearly.totalExpense.toLocaleString() || 0}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>結餘</div>
            <div className={`amount ${
              (summary?.yearly.balance || 0) >= 0 ? 'amount-income' : 'amount-expense'
            }`}>
              {(summary?.yearly.balance || 0) >= 0 ? '+' : ''}
              ${summary?.yearly.balance.toLocaleString() || 0}
            </div>
          </div>
        </div>
      </div>

      {/* 分類統計 */}
      {summary?.monthly.byCategory && Object.keys(summary.monthly.byCategory).length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ 
            fontSize: '0.875rem', 
            fontWeight: 600,
            marginBottom: '12px',
          }}>
            分類統計
          </h2>
          <div className="card" style={{ padding: '12px' }}>
            {Object.entries(summary.monthly.byCategory)
              .sort(([, a], [, b]) => b - a)
              .map(([category, amount]) => {
                const percentage = (amount / summary.monthly.totalExpense) * 100;
                return (
                  <div 
                    key={category}
                    style={{ 
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 0',
                      borderBottom: '1px solid var(--border-light)',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>{category}</div>
                      <div style={{ 
                        height: '4px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: '2px',
                        marginTop: '6px',
                        overflow: 'hidden',
                      }}>
                        <div 
                          style={{ 
                            height: '100%',
                            width: `${Math.min(percentage, 100)}%`,
                            background: 'var(--color-accent)',
                            borderRadius: '2px',
                            transition: 'width 0.5s var(--ease-out)',
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ 
                      marginLeft: '16px',
                      textAlign: 'right',
                    }}>
                      <div className="amount">${amount.toLocaleString()}</div>
                      <div style={{ 
                        fontSize: '0.75rem', 
                        color: 'var(--text-secondary)',
                      }}>
                        {percentage.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 近期交易 */}
      <div>
        <h2 style={{ 
          fontSize: '0.875rem', 
          fontWeight: 600,
          marginBottom: '12px',
        }}>
          {month} 月交易記錄
        </h2>
        {transactions.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '30px',
            color: 'var(--text-tertiary)',
          }}>
            本月尚無交易記錄
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {transactions.map((tx, index) => (
              <div
                key={tx.id || index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderBottom: index < transactions.length - 1 ? '1px solid var(--border-light)' : 'none',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{tx.name}</div>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: 'var(--text-secondary)',
                    marginTop: '2px',
                  }}>
                    {tx.category} · {tx.account} · {tx.date}
                  </div>
                </div>
                <div 
                  className={`amount ${tx.amount >= 0 ? 'amount-income' : 'amount-expense'}`}
                >
                  {tx.amount >= 0 ? '+' : ''}${Math.abs(tx.amount).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
