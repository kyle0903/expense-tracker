'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Account } from '@/types';

export default function AccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: '現金',
    initialBalance: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const accountTypes = ['現金', '銀行帳戶', '信用卡', '電子支付', '其他'];

  // 載入帳戶
  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      if (data.success) {
        setAccounts(data.data);
      }
    } catch (error) {
      console.error('Failed to load accounts:', error);
    } finally {
      setLoading(false);
    }
  }

  // 新增帳戶
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name || !formData.type) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          initialBalance: parseFloat(formData.initialBalance) || 0,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFormData({ name: '', type: '現金', initialBalance: '' });
        setShowForm(false);
        loadAccounts();
      } else {
        alert('新增失敗：' + data.error);
      }
    } catch (error) {
      console.error('Failed to create account:', error);
      alert('新增失敗');
    } finally {
      setIsSubmitting(false);
    }
  }

  // 計算總餘額
  const totalBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '80px' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ 
          fontSize: '1.5rem', 
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: 0,
        }}>
          帳戶
        </h1>
        <p style={{ 
          fontSize: '0.875rem', 
          color: 'var(--text-secondary)',
          marginTop: '4px',
        }}>
          管理您的銀行帳戶
        </p>
      </header>

      {/* 總覽卡片 */}
      <div 
        className="card"
        style={{ marginBottom: '20px', background: 'var(--bg-secondary)' }}
      >
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          總資產
        </div>
        <div 
          className="amount animate-slide-up"
          style={{ 
            fontSize: '2rem', 
            fontWeight: 700,
            marginTop: '4px',
          }}
        >
          ${totalBalance.toLocaleString()}
        </div>
      </div>

      {/* 帳戶列表 */}
      <div style={{ marginBottom: '16px' }}>
        {loading ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px',
            color: 'var(--text-tertiary)',
          }}>
            載入中...
          </div>
        ) : accounts.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px',
            color: 'var(--text-tertiary)',
          }}>
            尚無帳戶，請新增帳戶
          </div>
        ) : (
          accounts.map((account, index) => (
            <div
              key={account.id}
              className="card animate-fade-in"
              onClick={() => router.push(`/accounts/${account.id}`)}
              style={{ 
                marginBottom: '12px',
                animationDelay: `${index * 50}ms`,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{account.name}</div>
                  <div style={{ 
                    fontSize: '0.8125rem', 
                    color: 'var(--text-secondary)',
                    marginTop: '2px',
                  }}>
                    {account.type}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div 
                    className="amount"
                    style={{ fontSize: '1.125rem' }}
                  >
                    ${account.balance.toLocaleString()}
                  </div>
                  {account.transactionSum !== 0 && (
                    <div style={{ 
                      fontSize: '0.75rem', 
                      color: account.transactionSum > 0 ? 'var(--color-income)' : 'var(--color-expense)',
                    }}>
                      {account.transactionSum > 0 ? '+' : ''}
                      ${account.transactionSum.toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 新增帳戶按鈕/表單 */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-secondary"
          style={{ width: '100%' }}
        >
          + 新增帳戶
        </button>
      ) : (
        <div className="card animate-fade-in">
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                className="input"
                placeholder="帳戶名稱"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <select
                className="input"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              >
                {accountTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <input
                type="number"
                className="input"
                placeholder="初始金額"
                value={formData.initialBalance}
                onChange={(e) => setFormData({ ...formData, initialBalance: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                {isSubmitting ? '新增中...' : '新增'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
