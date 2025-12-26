'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Transaction, Account } from '@/types';
import { TransactionList } from '@/components/TransactionList';

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
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
        fetch(`/api/transactions?startDate=${startDate}&endDate=${endDate}`),
        fetch('/api/accounts'),
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
  }, [selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 更新交易
  const handleUpdate = async (transaction: Transaction) => {
    try {
      const res = await fetch('/api/transactions', {
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
      const res = await fetch(`/api/transactions?id=${id}`, {
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

  const [displayYear, displayMonth] = selectedMonth.split('-').map(Number);

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
            共 {transactions.length} 筆記錄
          </div>
          <TransactionList
            transactions={transactions}
            accounts={accounts}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        </>
      )}
    </div>
  );
}
