'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import type { Transaction, Account } from '@/types';
import { TransactionList } from '@/components/TransactionList';

type TransactionFilter = 'all' | 'expense' | 'income' | 'transfer';

export default function TransactionsPage() {
  const authFetch = useAuthFetch();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TransactionFilter>('all');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // 載入資料
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

      const [txRes, accRes] = await Promise.all([
        authFetch(`/api/transactions?startDate=${startDate}&endDate=${endDate}`),
        authFetch('/api/accounts'),
      ]);

      const txData = await txRes.json();
      const accData = await accRes.json();

      if (txData.success) {
        setTransactions(txData.data);
      }
      if (accData.success) {
        setAccounts(accData.data);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, authFetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 更新交易
  const handleUpdate = async (transaction: Transaction) => {
    try {
      const res = await authFetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transaction),
      });
      const data = await res.json();
      if (data.success) {
        loadData();
      } else {
        alert('更新失敗：' + data.error);
      }
    } catch (error) {
      console.error('Failed to update:', error);
      alert('更新失敗');
    }
  };

  // 刪除交易
  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這筆交易記錄嗎？')) return;
    
    try {
      const res = await authFetch(`/api/transactions?id=${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        loadData();
      } else {
        alert('刪除失敗：' + data.error);
      }
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('刪除失敗');
    }
  };

  // 切換月份
  const changeMonth = (delta: number) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const newDate = new Date(year, month - 1 + delta, 1);
    setSelectedMonth(
      `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`
    );
  };

  // 篩選交易
  const filteredTransactions = transactions.filter(tx => {
    if (filter === 'all') return true;
    if (filter === 'expense') return tx.amount < 0 && tx.category !== '轉帳';
    if (filter === 'income') return tx.amount > 0 && tx.category !== '轉帳';
    if (filter === 'transfer') return tx.category === '轉帳';
    return true;
  });

  const [displayYear, displayMonth] = selectedMonth.split('-').map(Number);

  // 獲取篩選後的筆數描述
  const getFilterLabel = () => {
    switch (filter) {
      case 'expense': return '支出';
      case 'income': return '收入';
      case 'transfer': return '轉帳';
      default: return '';
    }
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '80px' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ 
          fontSize: '1.5rem', 
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: 0,
        }}>
          交易紀錄
        </h1>
        <p style={{ 
          fontSize: '0.875rem', 
          color: 'var(--text-secondary)',
          marginTop: '4px',
        }}>
          查看和管理所有交易
        </p>
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
          {displayYear} 年 {displayMonth} 月
        </div>
        <button
          onClick={() => changeMonth(1)}
          className="btn btn-secondary"
          style={{ padding: '8px 12px', minWidth: 'auto' }}
        >
          ›
        </button>
      </div>

      {/* 篩選按鈕 */}
      <div style={{ 
        display: 'flex', 
        gap: '8px',
        marginBottom: '16px',
      }}>
        <button
          onClick={() => setFilter('all')}
          className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ 
            flex: 1,
            padding: '8px 12px',
            fontSize: '0.8125rem',
          }}
        >
          全部
        </button>
        <button
          onClick={() => setFilter('expense')}
          className={`btn ${filter === 'expense' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ 
            flex: 1,
            padding: '8px 12px',
            fontSize: '0.8125rem',
          }}
        >
          支出
        </button>
        <button
          onClick={() => setFilter('income')}
          className={`btn ${filter === 'income' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ 
            flex: 1,
            padding: '8px 12px',
            fontSize: '0.8125rem',
          }}
        >
          收入
        </button>
        <button
          onClick={() => setFilter('transfer')}
          className={`btn ${filter === 'transfer' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ 
            flex: 1,
            padding: '8px 12px',
            fontSize: '0.8125rem',
          }}
        >
          轉帳
        </button>
      </div>

      {/* 交易列表 */}
      {loading ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px',
          color: 'var(--text-tertiary)',
        }}>
          載入中...
        </div>
      ) : (
        <>
          <div style={{ 
            fontSize: '0.875rem', 
            color: 'var(--text-secondary)',
            marginBottom: '12px',
          }}>
            共 {filteredTransactions.length} 筆{getFilterLabel()}記錄
          </div>
          <TransactionList
            transactions={filteredTransactions}
            accounts={accounts}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        </>
      )}
    </div>
  );
}

