'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
  const [toAccount, setToAccount] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showToAccountPicker, setShowToAccountPicker] = useState(false);
  const [showNumpad, setShowNumpad] = useState(false);

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

  // 取得當前分類列表
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

  const selectedAccount = accounts.find((a) => a.name === account);
  const selectedToAccount = accounts.find((a) => a.name === toAccount);

  const canSubmit = mode === 'transfer' 
    ? amount && account && toAccount && account !== toAccount
    : amount && category && account && name;

  // 確認金額並關閉數字鍵盤
  const confirmAmount = () => {
    setShowNumpad(false);
  };

  return (
    <div className="quick-entry">
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
      <div className="mode-tabs">
        <button
          onClick={() => { setMode('expense'); setCategory(''); }}
          className={`mode-tab ${mode === 'expense' ? 'active expense' : ''}`}
        >
          支出
        </button>
        <button
          onClick={() => { setMode('income'); setCategory(''); }}
          className={`mode-tab ${mode === 'income' ? 'active income' : ''}`}
        >
          收入
        </button>
        <button
          onClick={() => { setMode('transfer'); setCategory('轉帳'); }}
          className={`mode-tab ${mode === 'transfer' ? 'active transfer' : ''}`}
        >
          轉帳
        </button>
      </div>

      {/* 金額顯示區塊 - 點擊打開數字鍵盤 */}
      <div 
        className={`amount-card ${mode}`}
        onClick={() => setShowNumpad(true)}
      >
        <div className="amount-label">金額</div>
        <div className="amount-value">
          <span className="amount-sign">{mode === 'expense' ? '-' : mode === 'income' ? '+' : ''}</span>
          <span className="amount-currency">$</span>
          <span className="amount-number">{formattedAmount}</span>
        </div>
        <div className="amount-tap-hint">點擊輸入金額</div>
      </div>

      {/* 快速選項區 */}
      <div className="quick-options">
        {mode === 'transfer' ? (
          <>
            {/* 轉帳帳戶選擇 */}
            <div className="transfer-accounts">
              <div className="transfer-account" onClick={() => { setShowAccountPicker(!showAccountPicker); setShowToAccountPicker(false); }}>
                <div className="transfer-label">從</div>
                <div className="transfer-name">{account || '選擇帳戶'}</div>
              </div>
              <div className="transfer-arrow">→</div>
              <div className="transfer-account" onClick={() => { setShowToAccountPicker(!showToAccountPicker); setShowAccountPicker(false); }}>
                <div className="transfer-label">到</div>
                <div className="transfer-name">{toAccount || '選擇帳戶'}</div>
              </div>
            </div>

            {/* 帳戶選擇器 */}
            {showAccountPicker && (
              <div className="account-dropdown">
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className={`account-option ${account === acc.name ? 'selected' : ''}`}
                    onClick={() => { setAccount(acc.name); setShowAccountPicker(false); }}
                  >
                    <span>{acc.name}</span>
                    <span className="account-balance">${acc.balance.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
            {showToAccountPicker && (
              <div className="account-dropdown">
                {accounts.filter(a => a.name !== account).map((acc) => (
                  <div
                    key={acc.id}
                    className={`account-option ${toAccount === acc.name ? 'selected' : ''}`}
                    onClick={() => { setToAccount(acc.name); setShowToAccountPicker(false); }}
                  >
                    <span>{acc.name}</span>
                    <span className="account-balance">${acc.balance.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* 分類選擇 - Grid 佈局 */}
            <div className="category-grid">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.name)}
                  className={`category-item ${category === cat.name ? 'selected' : ''}`}
                >
                  <span className="category-icon">{cat.icon}</span>
                  <span className="category-name">{cat.name}</span>
                </button>
              ))}
            </div>

            {/* 帳戶選擇 */}
            <div className="account-row" onClick={() => setShowAccountPicker(!showAccountPicker)}>
              <span className="account-label">帳戶</span>
              <span className="account-value">{account || '選擇'} ›</span>
            </div>

            {showAccountPicker && (
              <div className="account-dropdown">
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className={`account-option ${account === acc.name ? 'selected' : ''}`}
                    onClick={() => { setAccount(acc.name); setShowAccountPicker(false); }}
                  >
                    <span>{acc.name}</span>
                    <span className="account-balance">${acc.balance.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 名稱建議 */}
            {category && CATEGORY_SUGGESTIONS[category] && (
              <div className="name-suggestions">
                {CATEGORY_SUGGESTIONS[category].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setName(suggestion)}
                    className={`suggestion-chip ${name === suggestion ? 'selected' : ''}`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {/* 名稱輸入 */}
            <input
              type="text"
              className="note-input"
              placeholder="名稱（必填）"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ marginBottom: '10px' }}
            />

            {/* 備註輸入 */}
            <input
              type="text"
              className="note-input"
              placeholder="備註（選填）"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </>
        )}
      </div>

      {/* 送出按鈕 */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit || isSubmitting}
        className={`submit-btn ${mode}`}
      >
        {isSubmitting ? '處理中...' : '✓ 記錄'}
      </button>

      {/* 數字鍵盤 Modal */}
      {showNumpad && (
        <div className="numpad-overlay" onClick={() => setShowNumpad(false)}>
          <div className="numpad-modal" onClick={(e) => e.stopPropagation()}>
            <div className="numpad-display">
              <span className="numpad-sign">{mode === 'expense' ? '-' : mode === 'income' ? '+' : ''}</span>
              <span className="numpad-amount">${formattedAmount}</span>
            </div>
            <div className="numpad-grid">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((key) => (
                <button
                  key={key}
                  onClick={() => handleAmountInput(key === '⌫' ? 'backspace' : key)}
                  className="numpad-key"
                >
                  {key}
                </button>
              ))}
            </div>
            <button className="numpad-confirm" onClick={confirmAmount}>
              確認
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .quick-entry {
          padding-bottom: 100px;
        }

        /* 模式切換 */
        .mode-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }

        .mode-tab {
          flex: 1;
          padding: 10px;
          border: none;
          border-radius: 10px;
          background: var(--bg-secondary);
          color: var(--text-secondary);
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .mode-tab.active {
          color: white;
        }

        .mode-tab.active.expense {
          background: var(--color-expense);
        }

        .mode-tab.active.income {
          background: var(--color-income);
        }

        .mode-tab.active.transfer {
          background: var(--color-accent);
        }

        /* 金額卡片 */
        .amount-card {
          background: var(--bg-secondary);
          border-radius: 16px;
          padding: 24px;
          text-align: center;
          cursor: pointer;
          margin-bottom: 20px;
          border: 2px solid transparent;
          transition: all 0.2s;
        }

        .amount-card:hover {
          border-color: var(--border-medium);
        }

        .amount-card.expense .amount-value {
          color: var(--color-expense);
        }

        .amount-card.income .amount-value {
          color: var(--color-income);
        }

        .amount-card.transfer .amount-value {
          color: var(--color-accent);
        }

        .amount-label {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }

        .amount-value {
          font-size: 2.5rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }

        .amount-sign {
          font-size: 1.5rem;
          opacity: 0.7;
        }

        .amount-currency {
          font-size: 1.5rem;
          margin-right: 2px;
        }

        .amount-tap-hint {
          font-size: 0.75rem;
          color: var(--text-tertiary);
          margin-top: 8px;
        }

        /* 快速選項區 */
        .quick-options {
          margin-bottom: 20px;
        }

        /* 分類 Grid */
        .category-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-bottom: 16px;
        }

        .category-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 12px 8px;
          border: none;
          border-radius: 12px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          cursor: pointer;
          transition: all 0.2s;
        }

        .category-item.selected {
          background: var(--color-accent);
          color: white;
        }

        .category-icon {
          font-size: 1.25rem;
        }

        .category-name {
          font-size: 0.75rem;
        }

        /* 帳戶選擇 */
        .account-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 16px;
          background: var(--bg-secondary);
          border-radius: 12px;
          margin-bottom: 12px;
          cursor: pointer;
        }

        .account-label {
          color: var(--text-secondary);
          font-size: 0.9rem;
        }

        .account-value {
          color: var(--text-primary);
          font-weight: 500;
        }

        .account-dropdown {
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: 12px;
          margin-bottom: 12px;
          overflow: hidden;
        }

        .account-option {
          display: flex;
          justify-content: space-between;
          padding: 14px 16px;
          cursor: pointer;
          transition: background 0.15s;
        }

        .account-option:hover {
          background: var(--bg-hover);
        }

        .account-option.selected {
          background: var(--bg-hover);
        }

        .account-balance {
          color: var(--text-secondary);
          font-size: 0.85rem;
        }

        /* 轉帳帳戶 */
        .transfer-accounts {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .transfer-account {
          flex: 1;
          padding: 14px;
          background: var(--bg-secondary);
          border-radius: 12px;
          text-align: center;
          cursor: pointer;
        }

        .transfer-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }

        .transfer-name {
          font-weight: 500;
          color: var(--text-primary);
        }

        .transfer-arrow {
          color: var(--text-tertiary);
          font-size: 1.2rem;
        }

        /* 名稱建議 */
        .name-suggestions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 12px;
        }

        .suggestion-chip {
          padding: 6px 12px;
          border: 1px solid var(--border-light);
          border-radius: 16px;
          background: transparent;
          color: var(--text-secondary);
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .suggestion-chip.selected {
          background: var(--color-accent-bg);
          border-color: var(--color-accent);
          color: var(--color-accent);
        }

        /* 備註輸入 */
        .note-input {
          width: 100%;
          padding: 14px 16px;
          border: 1px solid var(--border-light);
          border-radius: 12px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 0.9rem;
        }

        .note-input::placeholder {
          color: var(--text-tertiary);
        }

        /* 送出按鈕 */
        .submit-btn {
          width: 100%;
          padding: 16px;
          border: none;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          color: white;
          cursor: pointer;
          transition: all 0.2s;
        }

        .submit-btn.expense {
          background: var(--color-expense);
        }

        .submit-btn.income {
          background: var(--color-income);
        }

        .submit-btn.transfer {
          background: var(--color-accent);
        }

        .submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* 數字鍵盤 Modal */
        .numpad-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          z-index: 100;
          animation: fadeIn 0.15s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .numpad-modal {
          width: 100%;
          max-width: 400px;
          background: var(--bg-primary);
          border-radius: 24px 24px 0 0;
          padding: 20px 20px 100px 20px;
          animation: slideUp 0.2s ease-out;
        }

        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }

        .numpad-display {
          text-align: center;
          padding: 20px;
          margin-bottom: 16px;
        }

        .numpad-sign {
          font-size: 1.5rem;
          color: var(--text-secondary);
        }

        .numpad-amount {
          font-size: 3rem;
          font-weight: 700;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }

        .numpad-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 16px;
        }

        .numpad-key {
          height: 60px;
          border: none;
          border-radius: 12px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 1.5rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.1s;
        }

        .numpad-key:active {
          background: var(--bg-hover);
        }

        .numpad-confirm {
          width: 100%;
          padding: 16px;
          border: none;
          border-radius: 12px;
          background: var(--color-accent);
          color: white;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
