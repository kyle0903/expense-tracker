'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSWRConfig } from 'swr';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { useAccounts } from '@/hooks/useAccounts';
import type { Transaction } from '@/types';
import { DEFAULT_CATEGORIES, CATEGORY_SUGGESTIONS } from '@/types';

interface QuickEntryProps {
  onSuccess?: () => void;
}

type EntryMode = 'expense' | 'income' | 'transfer';

// 取得台北時區的 ISO 格式日期字串
function getTaipeiISOString(): string {
  const now = new Date();
  // 台北時區偏移 +8 小時
  const taipeiOffset = 8 * 60; // 分鐘
  const utcOffset = now.getTimezoneOffset(); // 當前時區偏移（分鐘，反向）
  const taipeiTime = new Date(now.getTime() + (taipeiOffset + utcOffset) * 60 * 1000);

  const year = taipeiTime.getFullYear();
  const month = String(taipeiTime.getMonth() + 1).padStart(2, '0');
  const day = String(taipeiTime.getDate()).padStart(2, '0');
  const hours = String(taipeiTime.getHours()).padStart(2, '0');
  const minutes = String(taipeiTime.getMinutes()).padStart(2, '0');
  const seconds = String(taipeiTime.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+08:00`;
}

export function QuickEntry({ onSuccess }: QuickEntryProps) {
  const [amount, setAmount] = useState<string>('');
  const [mode, setMode] = useState<EntryMode>('expense');
  const [category, setCategory] = useState<string>('');
  const [account, setAccount] = useState<string>('');
  const [toAccount, setToAccount] = useState<string>('');
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showToAccountPicker, setShowToAccountPicker] = useState(false);
  const [showNumpad, setShowNumpad] = useState(false);

  // 代墊相關狀態
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [splitPeople, setSplitPeople] = useState(2);
  const [useCustomSplit, setUseCustomSplit] = useState(false);
  const [customSplitAmount, setCustomSplitAmount] = useState('');

  // 轉帳子模式：'transfer' 或 'repayment'
  const [transferSubMode, setTransferSubMode] = useState<'transfer' | 'repayment'>('transfer');

  const authFetch = useAuthFetch();
  const { accounts, mutate: mutateAccounts } = useAccounts();
  const { mutate: globalMutate } = useSWRConfig();

  // 設定預設帳戶
  useEffect(() => {
    if (accounts.length > 0 && !account) {
      setAccount(accounts[0].name);
    }
    if (accounts.length > 1 && !toAccount) {
      setToAccount(accounts[1].name);
    }
  }, [accounts, account, toAccount]);

  // 成功後的快取失效
  const invalidateCaches = useCallback(() => {
    mutateAccounts(); // 重新驗證帳戶餘額
    globalMutate(
      (key: unknown) => typeof key === 'string' && (
        key.startsWith('/api/transactions') || key.startsWith('/api/summary')
      ),
      undefined,
      { revalidate: true }
    );
  }, [mutateAccounts, globalMutate]);

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

  // 計算代墊金額
  const calculateSplitAmount = useCallback(() => {
    if (!amount || !isSplitPayment) return { ownAmount: parseFloat(amount || '0'), splitAmount: 0 };

    const totalAmount = parseFloat(amount);

    if (useCustomSplit && customSplitAmount) {
      // 使用自訂代墊金額
      const split = parseFloat(customSplitAmount);
      return {
        ownAmount: Math.max(0, totalAmount - split),
        splitAmount: Math.min(split, totalAmount)
      };
    } else {
      // 按人數均分
      const perPerson = Math.round(totalAmount / splitPeople);
      const ownAmount = perPerson;
      const splitAmount = totalAmount - perPerson;
      return { ownAmount, splitAmount };
    }
  }, [amount, isSplitPayment, splitPeople, useCustomSplit, customSplitAmount]);

  const { ownAmount, splitAmount } = calculateSplitAmount();

  // 送出表單
  const handleSubmit = async () => {
    if (!amount) return;

    if (mode === 'transfer') {
      setIsSubmitting(true);
      try {
        if (transferSubMode === 'repayment') {
          // 代墊還款模式：創建一筆收入交易（朋友還錢給你）
          if (!account || !name) {
            alert('請選擇帳戶並填寫還款人');
            setIsSubmitting(false);
            return;
          }

          const transaction: Transaction = {
            name: name,
            category: '代墊還款',
            date: getTaipeiISOString(),
            amount: parseFloat(amount), // 正數，代表收入
            account,
            note: note || '',
          };

          const res = await authFetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transaction),
          });

          const data = await res.json();
          if (data.success) {
            invalidateCaches();
            setShowSuccess(true);
            setTimeout(() => {
              setShowSuccess(false);
              setAmount('');
              setNote('');
              setName('');
              onSuccess?.();
            }, 1200);
          } else {
            alert('記錄失敗：' + data.error);
          }
        } else {
          // 帳戶轉帳模式
          if (!account || !toAccount || account === toAccount) {
            alert('請選擇不同的來源和目標帳戶');
            setIsSubmitting(false);
            return;
          }

          const res = await authFetch('/api/transfer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fromAccount: account,
              toAccount: toAccount,
              amount: parseFloat(amount),
              date: getTaipeiISOString(),
            }),
          });

          const data = await res.json();
          if (data.success) {
            invalidateCaches();
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
        }
      } catch (error) {
        console.error('Failed to submit:', error);
        alert('操作失敗，請稍後再試');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      if (!category || !account) return;

      setIsSubmitting(true);
      try {
        const totalAmount = parseFloat(amount);
        const currentDate = getTaipeiISOString();

        if (mode === 'expense' && isSplitPayment && amount) {
          // 代墊模式：創建兩筆交易
          const { ownAmount: myPortion, splitAmount: othersAmount } = calculateSplitAmount();

          const splitInfo = useCustomSplit
            ? `總額 $${totalAmount.toLocaleString()}, 代墊 $${othersAmount.toLocaleString()}`
            : `總額 $${totalAmount.toLocaleString()}, ${splitPeople}人均分`;

          // 交易 1: 個人支出（你的份額，計入支出報表）
          const personalExpense: Transaction = {
            name: name || category,
            category,
            date: currentDate,
            amount: -myPortion,
            account,
            note: note ? `[個人] ${splitInfo} | ${note}` : `[個人] ${splitInfo}`,
          };

          // 交易 2: 代墊款（幫別人付的，不計入支出報表）
          const advancePayment: Transaction = {
            name: `代墊 - ${name || category}`,
            category: '代墊',
            date: currentDate,
            amount: -othersAmount,
            account,
            note: note ? `[代墊] ${splitInfo} | ${note}` : `[代墊] ${splitInfo}`,
          };

          // 同時創建兩筆交易
          const [res1, res2] = await Promise.all([
            authFetch('/api/transactions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(personalExpense),
            }),
            authFetch('/api/transactions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(advancePayment),
            }),
          ]);

          const data1 = await res1.json();
          const data2 = await res2.json();

          if (data1.success && data2.success) {
            invalidateCaches();
            setShowSuccess(true);
            setTimeout(() => {
              setShowSuccess(false);
              setAmount('');
              setCategory('');
              setNote('');
              setName('');
              setIsSplitPayment(false);
              setSplitPeople(2);
              setUseCustomSplit(false);
              setCustomSplitAmount('');
              onSuccess?.();
            }, 1200);
          } else {
            alert('記錄失敗：' + (data1.error || data2.error));
          }
        } else {
          // 一般模式：只創建一筆交易
          const transaction: Transaction = {
            name: name || category,
            category,
            date: currentDate,
            amount: mode === 'expense' ? -totalAmount : totalAmount,
            account,
            note,
          };

          const res = await authFetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transaction),
          });

          const data = await res.json();
          if (data.success) {
            invalidateCaches();
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
    ? transferSubMode === 'repayment'
      ? amount && account && name
      : amount && account && toAccount && account !== toAccount
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
          onClick={() => { setMode('transfer'); setCategory('轉帳'); setTransferSubMode('transfer'); }}
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
      <div className={`quick-options ${mode}`}>
        {mode === 'transfer' ? (
          <>
            {/* 轉帳子模式切換 */}
            <div className="transfer-sub-tabs">
              <button
                className={`transfer-sub-tab ${transferSubMode === 'transfer' ? 'active' : ''}`}
                onClick={() => { setTransferSubMode('transfer'); setCategory('轉帳'); setName(''); }}
              >
                💳 帳戶轉帳
              </button>
              <button
                className={`transfer-sub-tab ${transferSubMode === 'repayment' ? 'active' : ''}`}
                onClick={() => { setTransferSubMode('repayment'); setCategory('代墊還款'); setName('朋友還款'); }}
              >
                🤝 代墊還款
              </button>
            </div>

            {transferSubMode === 'transfer' ? (
              <>
                {/* 帳戶轉帳 UI */}
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
                {/* 帳戶選擇 - 卡片式 */}
                <div className="account-cards">
                  {accounts.map((acc) => (
                    <button
                      key={acc.id}
                      onClick={() => setAccount(acc.name)}
                      className={`account-card ${account === acc.name ? 'selected' : ''}`}
                    >
                      <span className="account-card-name">{acc.name}</span>
                      <span className="account-card-balance">${acc.balance.toLocaleString()}</span>
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  className="note-input"
                  placeholder="還款人（例如：小明還款）"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ marginBottom: '10px' }}
                />

                <input
                  type="text"
                  className="note-input"
                  placeholder="備註（選填）"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </>
            )}
          </>
        ) : (
          <>
            {/* 分類選擇 */}
            <div className="section-label">分類</div>
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

            {/* 代墊功能 - 只在支出模式顯示，放在帳戶上面 */}
            {mode === 'expense' && (
              <div className="split-payment-section">
                <div className="split-toggle-row" onClick={() => setIsSplitPayment(!isSplitPayment)}>
                  <span className="split-label">💰 代墊付款</span>
                  <div className={`toggle-switch ${isSplitPayment ? 'active' : ''}`}>
                    <div className="toggle-knob"></div>
                  </div>
                </div>

                {isSplitPayment && (
                  <div className="split-options">
                    {/* 計算方式選擇 */}
                    <div className="split-mode-tabs">
                      <button
                        className={`split-mode-tab ${!useCustomSplit ? 'active' : ''}`}
                        onClick={() => setUseCustomSplit(false)}
                      >
                        按人數均分
                      </button>
                      <button
                        className={`split-mode-tab ${useCustomSplit ? 'active' : ''}`}
                        onClick={() => setUseCustomSplit(true)}
                      >
                        自訂代墊金額
                      </button>
                    </div>

                    {!useCustomSplit ? (
                      /* 人數選擇 */
                      <div className="people-selector">
                        <span className="people-label">分攤人數</span>
                        <div className="people-buttons">
                          {[2, 3, 4, 5, 6].map(num => (
                            <button
                              key={num}
                              className={`people-btn ${splitPeople === num ? 'selected' : ''}`}
                              onClick={() => setSplitPeople(num)}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      /* 自訂金額輸入 */
                      <div className="custom-split-input">
                        <span className="custom-split-label">代墊金額</span>
                        <input
                          type="number"
                          className="note-input"
                          placeholder="輸入他人應還金額"
                          value={customSplitAmount}
                          onChange={(e) => setCustomSplitAmount(e.target.value)}
                          style={{ textAlign: 'right' }}
                        />
                      </div>
                    )}

                    {/* 計算結果顯示 */}
                    {amount && (
                      <div className="split-summary">
                        <div className="split-summary-row">
                          <span>總金額</span>
                          <span className="split-total">${parseFloat(amount).toLocaleString()}</span>
                        </div>
                        <div className="split-summary-row">
                          <span>代墊（他人還款）</span>
                          <span className="split-others">${splitAmount.toLocaleString()}</span>
                        </div>
                        <div className="split-summary-row highlight">
                          <span>你的支出</span>
                          <span className="split-own">-${ownAmount.toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 帳戶選擇 - 卡片式 */}
            <div className="section-label">帳戶</div>
            <div className="account-cards">
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => setAccount(acc.name)}
                  className={`account-card ${account === acc.name ? 'selected' : ''}`}
                >
                  <span className="account-card-name">{acc.name}</span>
                  <span className="account-card-balance">${acc.balance.toLocaleString()}</span>
                </button>
              ))}
            </div>
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

        .mode-tab.active.repayment {
          background: #10b981;
        }

        .repayment-info { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 20px; background: var(--bg-secondary); border-radius: 12px; margin-bottom: 16px; border: 1px dashed var(--border-medium); }
        .repayment-text { font-size: 0.85rem; color: var(--text-secondary); text-align: center; }

        .amount-card { background: var(--bg-secondary); border-radius: 16px; padding: 24px; text-align: center; cursor: pointer; margin-bottom: 20px; border: 2px solid transparent; transition: all 0.2s; }
        .amount-card:hover { border-color: var(--border-medium); }
        .amount-card.expense .amount-value { color: var(--color-expense); }
        .amount-card.income .amount-value { color: var(--color-income); }
        .amount-card.transfer .amount-value { color: var(--color-accent); }
        .amount-card.repayment .amount-value { color: #10b981; }
        .amount-label { font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 8px; }
        .amount-value { font-size: 2.5rem; font-weight: 700; font-variant-numeric: tabular-nums; }
        .amount-sign { font-size: 1.5rem; opacity: 0.7; }
        .amount-currency { font-size: 1.5rem; margin-right: 2px; }
        .amount-tap-hint { font-size: 0.75rem; color: var(--text-tertiary); margin-top: 8px; }

        .quick-options { margin-bottom: 20px; }

        .category-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
        .category-item { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 8px; border: none; border-radius: 12px; background: var(--bg-secondary); color: var(--text-primary); cursor: pointer; transition: all 0.2s; }
        .category-item.selected { background: var(--color-accent); color: white; }
        .quick-options.expense .category-item.selected { background: var(--color-expense); }
        .quick-options.income .category-item.selected { background: var(--color-income); }
        .category-icon { font-size: 1.25rem; }
        .category-name { font-size: 0.75rem; }

        .section-label { font-size: 0.8rem; font-weight: 500; color: var(--text-secondary); margin-bottom: 10px; margin-top: 8px; padding-left: 4px; }

        .account-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
        .account-card { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 8px; border: none; border-radius: 12px; background: var(--bg-secondary); cursor: pointer; transition: all 0.2s; }
        .account-card.selected { background: var(--color-accent); }
        .quick-options.expense .account-card.selected { background: rgba(239, 68, 68, 0.2); border: 1px solid var(--color-expense); }
        .quick-options.expense .account-card.selected .account-card-name { color: var(--color-expense); }
        .quick-options.expense .account-card.selected .account-card-balance { color: var(--color-expense); opacity: 0.8; }
        .quick-options.transfer .account-card.selected { background: rgba(59, 130, 246, 0.2); border: 1px solid var(--color-accent); }
        .quick-options.transfer .account-card.selected .account-card-name { color: var(--color-accent); }
        .quick-options.transfer .account-card.selected .account-card-balance { color: var(--color-accent); opacity: 0.8; }
        .quick-options.income .account-card.selected { background: rgba(34, 197, 94, 0.2); border: 1px solid var(--color-income); }
        .quick-options.income .account-card.selected .account-card-name { color: var(--color-income); }
        .quick-options.income .account-card.selected .account-card-balance { color: var(--color-income); opacity: 0.8; }
        .account-card-name { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); }
        .account-card.selected .account-card-name { color: white; }
        .account-card-balance { font-size: 0.7rem; color: var(--text-secondary); }
        .account-card.selected .account-card-balance { color: rgba(255, 255, 255, 0.8); }

        .account-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; background: var(--bg-secondary); border-radius: 12px; margin-bottom: 12px; cursor: pointer; border-left: 4px solid var(--color-accent); }
        .account-label { color: var(--text-primary); font-size: 0.9rem; font-weight: 500; }
        .account-value { color: var(--color-accent); font-weight: 600; }
        .account-dropdown { background: var(--bg-primary); border: 1px solid var(--border-light); border-radius: 12px; margin-bottom: 12px; overflow: hidden; }
        .account-option { display: flex; justify-content: space-between; padding: 14px 16px; cursor: pointer; transition: background 0.15s; }
        .account-option:hover { background: var(--bg-hover); }
        .account-option.selected { background: var(--bg-hover); }
        .account-balance { color: var(--text-secondary); font-size: 0.85rem; }

        .transfer-sub-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
        .transfer-sub-tab { flex: 1; padding: 10px 12px; border: 1px solid var(--border-light); border-radius: 10px; background: transparent; color: var(--text-secondary); font-size: 0.85rem; cursor: pointer; transition: all 0.2s; }
        .transfer-sub-tab.active { background: var(--color-accent); border-color: var(--color-accent); color: white; }

        .transfer-accounts { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .transfer-account { flex: 1; padding: 14px; background: var(--bg-secondary); border-radius: 12px; text-align: center; cursor: pointer; }
        .transfer-label { font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 4px; }
        .transfer-name { font-weight: 500; color: var(--text-primary); }
        .transfer-arrow { color: var(--text-tertiary); font-size: 1.2rem; }

        .split-payment-section { background: var(--bg-secondary); border-radius: 12px; margin-bottom: 12px; margin-top: 12px; overflow: hidden; }
        .split-toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; cursor: pointer; }
        .split-label { font-size: 0.9rem; color: var(--text-primary); font-weight: 500; }
        .toggle-switch { width: 44px; height: 24px; background: var(--border-medium); border-radius: 12px; position: relative; transition: background 0.2s; }
        .toggle-switch.active { background: var(--color-accent); }
        .quick-options.expense .toggle-switch.active { background: var(--color-expense); }
        .toggle-knob { width: 20px; height: 20px; background: white; border-radius: 50%; position: absolute; top: 2px; left: 2px; transition: transform 0.2s; }
        .toggle-switch.active .toggle-knob { transform: translateX(20px); }
        .split-options { padding: 0 16px 16px; border-top: 1px solid var(--border-light); }
        .split-mode-tabs { display: flex; gap: 8px; margin: 12px 0; }
        .split-mode-tab { flex: 1; padding: 8px 12px; border: 1px solid var(--border-light); border-radius: 8px; background: transparent; color: var(--text-secondary); font-size: 0.8rem; cursor: pointer; transition: all 0.2s; }
        .split-mode-tab.active { background: var(--color-accent-bg); border-color: var(--color-accent); color: var(--color-accent); }
        .quick-options.expense .split-mode-tab.active { background: rgba(239, 68, 68, 0.1); border-color: var(--color-expense); color: var(--color-expense); }
        .people-selector { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .people-label { font-size: 0.85rem; color: var(--text-secondary); }
        .people-buttons { display: flex; gap: 6px; }
        .people-btn { width: 36px; height: 36px; border: 1px solid var(--border-light); border-radius: 8px; background: transparent; color: var(--text-primary); font-size: 0.9rem; cursor: pointer; transition: all 0.2s; }
        .people-btn.selected { background: var(--color-accent); border-color: var(--color-accent); color: white; }
        .quick-options.expense .people-btn.selected { background: var(--color-expense); border-color: var(--color-expense); }
        .custom-split-input { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
        .custom-split-label { font-size: 0.85rem; color: var(--text-secondary); white-space: nowrap; }
        .custom-split-input .note-input { flex: 1; margin: 0; }
        .split-summary { background: var(--bg-primary); border-radius: 8px; padding: 12px; }
        .split-summary-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 0.85rem; color: var(--text-secondary); }
        .split-summary-row.highlight { border-top: 1px dashed var(--border-light); margin-top: 6px; padding-top: 12px; font-weight: 600; color: var(--text-primary); }
        .split-total { color: var(--text-primary); }
        .split-others { color: var(--color-accent); }
        .split-own { color: var(--color-expense); font-size: 1rem; }

        .name-suggestions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
        .suggestion-chip { padding: 6px 12px; border: 1px solid var(--border-light); border-radius: 16px; background: transparent; color: var(--text-secondary); font-size: 0.8rem; cursor: pointer; transition: all 0.2s; }
        .suggestion-chip.selected { background: var(--color-accent-bg); border-color: var(--color-accent); color: var(--color-accent); }
        .quick-options.expense .suggestion-chip.selected { background: rgba(239, 68, 68, 0.1); border-color: var(--color-expense); color: var(--color-expense); }
        .quick-options.income .suggestion-chip.selected { background: rgba(34, 197, 94, 0.1); border-color: var(--color-income); color: var(--color-income); }

        .note-input { width: 100%; padding: 14px 16px; border: 1px solid var(--border-light); border-radius: 12px; background: var(--bg-primary); color: var(--text-primary); font-size: 0.9rem; }
        .note-input::placeholder { color: var(--text-tertiary); }

        .submit-btn { width: 100%; padding: 16px; border: none; border-radius: 12px; font-size: 1rem; font-weight: 600; color: white; cursor: pointer; transition: all 0.2s; }
        .submit-btn.expense { background: var(--color-expense); }
        .submit-btn.income { background: var(--color-income); }
        .submit-btn.transfer { background: var(--color-accent); }
        .submit-btn.repayment { background: #10b981; }
        .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .numpad-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: flex-end; justify-content: center; z-index: 100; animation: fadeIn 0.15s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .numpad-modal { width: 100%; max-width: 400px; background: var(--bg-primary); border-radius: 24px 24px 0 0; padding: 20px 20px 100px 20px; animation: slideUp 0.2s ease-out; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .numpad-display { text-align: center; padding: 20px; margin-bottom: 16px; }
        .numpad-sign { font-size: 1.5rem; color: var(--text-secondary); }
        .numpad-amount { font-size: 3rem; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
        .numpad-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
        .numpad-key { height: 60px; border: none; border-radius: 12px; background: var(--bg-secondary); color: var(--text-primary); font-size: 1.5rem; font-weight: 500; cursor: pointer; transition: background 0.1s; }
        .numpad-key:active { background: var(--bg-hover); }
        .numpad-confirm { width: 100%; padding: 16px; border: none; border-radius: 12px; background: var(--color-accent); color: white; font-size: 1.1rem; font-weight: 600; cursor: pointer; }
      `}</style>
    </div>
  );
}
