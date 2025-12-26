'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Transaction, Account } from '@/types';
import { DEFAULT_CATEGORIES, CATEGORY_SUGGESTIONS } from '@/types';

interface QuickEntryProps {
  onSuccess?: () => void;
}

type EntryMode = 'expense' | 'income' | 'transfer';

export function QuickEntry({ onSuccess }: QuickEntryProps) {
  const [amount, setAmount] = useState<string>('');
  const [mode, setMode] = useState<EntryMode>('expense');
  const [category, setCategory] = useState<string>('');
  const [account, setAccount] = useState<string>('');
  const [toAccount, setToAccount] = useState<string>(''); // 轉帳目標帳戶
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showToAccountPicker, setShowToAccountPicker] = useState(false);

  // 載入帳戶列表
  useEffect(() => {
    async function loadAccounts() {
      try {
        const res = await fetch('/api/accounts');
        const data = await res.json();
        if (data.success && data.data) {
          setAccounts(data.data);
          if (data.data.length > 0 && !account) {
            setAccount(data.data[0].name);
          }
          if (data.data.length > 1 && !toAccount) {
            setToAccount(data.data[1].name);
          }
        }
      } catch (error) {
        console.error('Failed to load accounts:', error);
      }
    }
    loadAccounts();
  }, []);

  // 取得當前分類列表（轉帳模式不需要分類選擇）
  const categories = DEFAULT_CATEGORIES.filter(
    (c) => c.type === (mode === 'expense' ? 'expense' : mode === 'income' ? 'income' : 'transfer')
  );

  // 處理數字輸入
  const handleAmountInput = useCallback((digit: string) => {
    setAmount((prev) => {
      if (digit === 'backspace') {
        return prev.slice(0, -1);
      }
      if (digit === '.' && prev.includes('.')) {
        return prev;
      }
      // 限制小數點後兩位
      if (prev.includes('.') && prev.split('.')[1].length >= 2) {
        return prev;
      }
      return prev + digit;
    });
  }, []);

  // 格式化金額顯示
  const formattedAmount = amount
    ? parseFloat(amount).toLocaleString('zh-TW', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })
    : '0';

  // 送出表單
  const handleSubmit = async () => {
    if (!amount) return;
    
    if (mode === 'transfer') {
      // 轉帳模式
      if (!account || !toAccount || account === toAccount) {
        alert('請選擇不同的來源和目標帳戶');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await fetch('/api/transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromAccount: account,
            toAccount: toAccount,
            amount: parseFloat(amount),
            date: new Date().toISOString().split('T')[0],
          }),
        });

        const data = await res.json();
        if (data.success) {
          setShowSuccess(true);
          setTimeout(() => {
            setShowSuccess(false);
            setAmount('');
            setNote('');
            setName('');
            onSuccess?.();
          }, 1200);
        } else {
          alert('轉帳失敗：' + data.error);
        }
      } catch (error) {
        console.error('Failed to submit:', error);
        alert('轉帳失敗，請稍後再試');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // 一般收支模式
      if (!category || !account) return;

      setIsSubmitting(true);
      try {
        const transaction: Transaction = {
          name: name || category,
          category,
          date: new Date().toISOString().split('T')[0],
          amount: mode === 'expense' ? -parseFloat(amount) : parseFloat(amount),
          account,
          note,
        };

        const res = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(transaction),
        });

        const data = await res.json();
        if (data.success) {
          setShowSuccess(true);
          setTimeout(() => {
            setShowSuccess(false);
            setAmount('');
            setCategory('');
            setNote('');
            setName('');
            onSuccess?.();
          }, 1200);
        } else {
          alert('記錄失敗：' + data.error);
        }
      } catch (error) {
        console.error('Failed to submit:', error);
        alert('記錄失敗，請稍後再試');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // 取得選中帳戶
  const selectedAccount = accounts.find((a) => a.name === account);
  const selectedToAccount = accounts.find((a) => a.name === toAccount);

  // 檢查是否可以送出
  const canSubmit = mode === 'transfer' 
    ? amount && account && toAccount && account !== toAccount
    : amount && category && account;

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '70px' }}>
      {/* 成功提示 */}
      {showSuccess && (
        <div className="success-overlay">
          <div className="animate-slide-up" style={{ textAlign: 'center' }}>
            <svg className="success-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path className="animate-check" d="M4 12l6 6L20 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p style={{ marginTop: '12px', color: 'var(--color-income)', fontWeight: 500 }}>
              {mode === 'transfer' ? '轉帳成功' : '記錄成功'}
            </p>
          </div>
        </div>
      )}

      {/* 模式切換 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => { setMode('expense'); setCategory(''); }}
          className={`btn ${mode === 'expense' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flex: 1 }}
        >
          支出
        </button>
        <button
          onClick={() => { setMode('income'); setCategory(''); }}
          className={`btn ${mode === 'income' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flex: 1 }}
        >
          收入
        </button>
        <button
          onClick={() => { setMode('transfer'); setCategory('轉帳'); }}
          className={`btn ${mode === 'transfer' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flex: 1 }}
        >
          轉帳
        </button>
      </div>

      {/* 金額顯示 */}
      <div className={`amount-display ${amount ? 'has-value' : 'no-value'}`}>
        {mode === 'expense' ? '-' : mode === 'income' ? '+' : ''}${formattedAmount}
      </div>

      {/* 轉帳模式：帳戶選擇 */}
      {mode === 'transfer' ? (
        <div style={{ marginBottom: '20px' }}>
          {/* 來源帳戶 */}
          <div style={{ marginBottom: '12px', position: 'relative' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              從哪個帳戶轉出
            </div>
            <div
              className="account-selector"
              onClick={() => { setShowAccountPicker(!showAccountPicker); setShowToAccountPicker(false); }}
            >
              <span className="account-icon">💳</span>
              <div className="account-info">
                <div className="account-name">{account || '選擇帳戶'}</div>
                {selectedAccount && (
                  <div className="account-balance">
                    餘額 ${selectedAccount.balance.toLocaleString()}
                  </div>
                )}
              </div>
              <span style={{ color: 'var(--text-tertiary)' }}>›</span>
            </div>
            
            {showAccountPicker && (
              <div
                className="card animate-fade-in"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '4px',
                  zIndex: 50,
                  padding: '8px',
                }}
              >
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    onClick={() => {
                      setAccount(acc.name);
                      setShowAccountPicker(false);
                    }}
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)',
                      background: account === acc.name ? 'var(--bg-hover)' : 'transparent',
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>{acc.name}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {acc.type} · ${acc.balance.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 目標帳戶 */}
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              轉入哪個帳戶
            </div>
            <div
              className="account-selector"
              onClick={() => { setShowToAccountPicker(!showToAccountPicker); setShowAccountPicker(false); }}
            >
              <span className="account-icon">🏦</span>
              <div className="account-info">
                <div className="account-name">{toAccount || '選擇帳戶'}</div>
                {selectedToAccount && (
                  <div className="account-balance">
                    餘額 ${selectedToAccount.balance.toLocaleString()}
                  </div>
                )}
              </div>
              <span style={{ color: 'var(--text-tertiary)' }}>›</span>
            </div>
            
            {showToAccountPicker && (
              <div
                className="card animate-fade-in"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '4px',
                  zIndex: 50,
                  padding: '8px',
                }}
              >
                {accounts.filter(a => a.name !== account).map((acc) => (
                  <div
                    key={acc.id}
                    onClick={() => {
                      setToAccount(acc.name);
                      setShowToAccountPicker(false);
                    }}
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)',
                      background: toAccount === acc.name ? 'var(--bg-hover)' : 'transparent',
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>{acc.name}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {acc.type} · ${acc.balance.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* 分類選擇 */}
          <div style={{ marginBottom: '20px' }}>
            <div className="category-grid">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.name)}
                  className={`category-item ${category === cat.name ? 'selected' : ''}`}
                >
                  <span className="category-item-icon">{cat.icon}</span>
                  <span className="category-item-name">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 帳戶選擇 */}
          <div style={{ marginBottom: '16px', position: 'relative' }}>
            <div
              className="account-selector"
              onClick={() => setShowAccountPicker(!showAccountPicker)}
            >
              <span className="account-icon">💳</span>
              <div className="account-info">
                <div className="account-name">{account || '選擇帳戶'}</div>
                {selectedAccount && (
                  <div className="account-balance">
                    餘額 ${selectedAccount.balance.toLocaleString()}
                  </div>
                )}
              </div>
              <span style={{ color: 'var(--text-tertiary)' }}>›</span>
            </div>
            
            {showAccountPicker && (
              <div
                className="card animate-fade-in"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '4px',
                  zIndex: 50,
                  padding: '8px',
                }}
              >
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    onClick={() => {
                      setAccount(acc.name);
                      setShowAccountPicker(false);
                    }}
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)',
                      background: account === acc.name ? 'var(--bg-hover)' : 'transparent',
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>{acc.name}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {acc.type} · ${acc.balance.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* 名稱與備註（非轉帳模式） */}
      {mode !== 'transfer' && (
        <div style={{ marginBottom: '16px' }}>
          {/* 名稱建議標籤 */}
          {category && CATEGORY_SUGGESTIONS[category] && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ 
                fontSize: '0.75rem', 
                color: 'var(--text-secondary)', 
                marginBottom: '6px' 
              }}>
                常用名稱
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {CATEGORY_SUGGESTIONS[category].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setName(suggestion)}
                    className="btn btn-secondary"
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.8125rem',
                      minWidth: 'auto',
                      background: name === suggestion ? 'var(--color-accent-bg)' : undefined,
                      borderColor: name === suggestion ? 'var(--color-accent)' : undefined,
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          <input
            type="text"
            className="input"
            placeholder="名稱（選填）"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ marginBottom: '8px' }}
          />
          <input
            type="text"
            className="input"
            placeholder="備註（選填）"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      )}

      {/* 數字鍵盤 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          marginBottom: '16px',
        }}
      >
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace'].map(
          (key) => (
            <button
              key={key}
              onClick={() => handleAmountInput(key)}
              className="btn btn-secondary"
              style={{
                height: '52px',
                fontSize: key === 'backspace' ? '1.25rem' : '1.25rem',
                fontWeight: 500,
              }}
            >
              {key === 'backspace' ? '⌫' : key}
            </button>
          )
        )}
      </div>

      {/* 送出按鈕 */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit || isSubmitting}
        className="btn btn-primary"
        style={{
          width: '100%',
          height: '52px',
          fontSize: '1rem',
          opacity: !canSubmit || isSubmitting ? 0.5 : 1,
        }}
      >
        {isSubmitting 
          ? (mode === 'transfer' ? '轉帳中...' : '記錄中...') 
          : (mode === 'transfer' ? '✓ 轉帳' : '✓ 記錄')}
      </button>
    </div>
  );
}
