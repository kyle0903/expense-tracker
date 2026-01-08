'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import type { Transaction, Account } from '@/types';
import { TransactionList } from '@/components/TransactionList';

export default function AccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const authFetch = useAuthFetch();
  const accountId = params.accountId as string;

  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  // 月份選擇器
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  // 編輯初始金額
  const [isEditingBalance, setIsEditingBalance] = useState(false);
  const [editBalance, setEditBalance] = useState('');

  // 過濾選中月份的交易
  const filteredTransactions = transactions.filter((tx) => {
    const txDate = new Date(tx.date);
    return txDate.getFullYear() === selectedYear && txDate.getMonth() + 1 === selectedMonth;
  });

  // 計算選中月份的交易加總
  const monthlyTransactionSum = filteredTransactions
    .reduce((sum, tx) => {
      // 排除轉帳類型
      if (tx.category === '轉帳') return sum;
      return sum + tx.amount;
    }, 0);

  // 生成月份選項（最近12個月）
  const monthOptions = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthOptions.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`,
    });
  }

  // 載入資料
  const loadData = useCallback(async () => {
    if (!accountId) return;
    
    setLoading(true);
    try {
      // 先載入所有帳戶來取得帳戶資訊和名稱
      const accRes = await authFetch('/api/accounts');
      const accData = await accRes.json();
      
      if (accData.success) {
        setAccounts(accData.data);
        const currentAccount = accData.data.find((a: Account) => a.id === accountId);
        
        if (currentAccount) {
          setAccount(currentAccount);
          
          // 取得該帳戶的交易記錄
          const txRes = await authFetch('/api/transactions');
          const txData = await txRes.json();
          
          if (txData.success) {
            // 過濾該帳戶的交易
            const filtered = txData.data.filter(
              (tx: Transaction) => tx.account === currentAccount.name
            );
            setTransactions(filtered);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [accountId, authFetch]);

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

  // 開始編輯初始金額
  const startEditBalance = () => {
    setEditBalance(account?.initialBalance?.toString() || '0');
    setIsEditingBalance(true);
  };

  // 儲存初始金額
  const saveInitialBalance = async () => {
    const newBalance = parseFloat(editBalance);
    if (isNaN(newBalance)) {
      alert('請輸入有效的金額');
      return;
    }

    try {
      const res = await authFetch('/api/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: accountId,
          initialBalance: newBalance,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsEditingBalance(false);
        loadData();
      } else {
        alert('更新失敗：' + data.error);
      }
    } catch (error) {
      console.error('Failed to update:', error);
      alert('更新失敗');
    }
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

  if (!account) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '60px 0',
        color: 'var(--text-tertiary)',
      }}>
        找不到此帳戶
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '80px' }}>
      {/* 返回按鈕 */}
      <button
        onClick={() => router.push('/accounts')}
        className="btn btn-secondary"
        style={{ 
          marginBottom: '16px',
          padding: '8px 12px',
          fontSize: '0.875rem',
        }}
      >
        ← 返回帳戶列表
      </button>

      {/* 帳戶資訊 */}
      <div 
        className="card"
        style={{ marginBottom: '20px', background: 'var(--bg-secondary)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ 
              fontSize: '1.5rem', 
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}>
              {account.name}
            </h1>
            <p style={{ 
              fontSize: '0.875rem', 
              color: 'var(--text-secondary)',
              marginTop: '4px',
            }}>
              {account.type}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div 
              className="amount"
              style={{ fontSize: '1.5rem' }}
            >
              ${account.balance.toLocaleString()}
            </div>
            <div style={{ 
              fontSize: '0.75rem', 
              color: 'var(--text-secondary)',
              marginTop: '2px',
            }}>
              目前餘額
            </div>
          </div>
        </div>
        
        {/* 初始金額 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '16px',
          paddingTop: '12px',
          borderTop: '1px solid var(--border-light)',
          fontSize: '0.875rem',
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>初始金額：</span>
          {isEditingBalance ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="number"
                value={editBalance}
                onChange={(e) => setEditBalance(e.target.value)}
                style={{
                  width: '100px',
                  padding: '4px 8px',
                  fontSize: '0.875rem',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '4px',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveInitialBalance();
                  if (e.key === 'Escape') setIsEditingBalance(false);
                }}
              />
              <button
                onClick={saveInitialBalance}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  background: 'var(--text-primary)',
                  color: 'var(--bg-primary)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                儲存
              </button>
              <button
                onClick={() => setIsEditingBalance(false)}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
            </div>
          ) : (
            <>
              <span>${account.initialBalance.toLocaleString()}</span>
              <button
                onClick={startEditBalance}
                style={{
                  padding: '2px 6px',
                  fontSize: '0.7rem',
                  background: 'transparent',
                  color: 'var(--text-tertiary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                編輯
              </button>
            </>
          )}
        </div>
      </div>

      {/* 交易記錄 */}
      <div>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '12px',
        }}>
          <h2 style={{ 
            fontSize: '0.875rem', 
            fontWeight: 600,
            margin: 0,
          }}>
            交易記錄 ({filteredTransactions.length})
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <select
              value={`${selectedYear}-${selectedMonth}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-').map(Number);
                setSelectedYear(y);
                setSelectedMonth(m);
              }}
              style={{
                padding: '4px 8px',
                fontSize: '0.75rem',
                border: '1px solid var(--border-medium)',
                borderRadius: '4px',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              {monthOptions.map((opt) => (
                <option key={opt.label} value={`${opt.year}-${opt.month}`}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span style={{ 
              fontSize: '0.8125rem',
              color: monthlyTransactionSum >= 0 ? 'var(--color-income)' : 'var(--color-expense)',
              fontWeight: 600,
            }}>
              {monthlyTransactionSum >= 0 ? '+' : ''}${monthlyTransactionSum.toLocaleString()}
            </span>
          </div>
        </div>
        <TransactionList
          transactions={filteredTransactions}
          accounts={accounts}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
