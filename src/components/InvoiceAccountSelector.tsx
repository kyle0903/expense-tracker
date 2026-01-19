'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '@/lib/auth';
import type { Account } from '@/types';

interface InvoiceAccountSelectorProps {
  disabled?: boolean;
}

export default function InvoiceAccountSelector({ disabled }: InvoiceAccountSelectorProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [carrierAccount, setCarrierAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // 取得帳戶列表
  const fetchAccounts = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/accounts', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        setAccounts(data.data);
        // 找出載具帳戶
        const carrier = data.data.find((a: Account) => a.isCarrierAccount);
        setCarrierAccount(carrier || null);
      }
    } catch {
      // 靜默處理錯誤
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // 設定載具帳戶
  const handleSelectAccount = async (account: Account) => {
    if (account.id === carrierAccount?.id) {
      setIsOpen(false);
      return;
    }

    setSaving(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/accounts/carrier', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ accountId: account.id }),
      });
      const data = await res.json();
      if (data.success) {
        setCarrierAccount(account);
        // 更新本地帳戶列表的 isCarrierAccount 狀態
        setAccounts(accounts.map(a => ({
          ...a,
          isCarrierAccount: a.id === account.id,
        })));
      }
    } catch {
      // 靜默處理錯誤
    } finally {
      setSaving(false);
      setIsOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="account-selector">
        <div className="selector-label">載具綁定帳戶</div>
        <div className="selector-button skeleton">
          <span>載入中...</span>
        </div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  return (
    <div className="account-selector">
      <div className="selector-label">載具綁定帳戶</div>
      <div className="selector-wrapper">
        <button
          className={`selector-button ${isOpen ? 'open' : ''}`}
          onClick={() => !disabled && !saving && setIsOpen(!isOpen)}
          disabled={disabled || saving}
        >
          <span className="selected-name">
            {saving ? '儲存中...' : carrierAccount?.name || '未設定'}
          </span>
          <svg className="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {isOpen && (
          <div className="dropdown">
            {accounts.map((account) => (
              <button
                key={account.id}
                className={`dropdown-item ${account.id === carrierAccount?.id ? 'selected' : ''}`}
                onClick={() => handleSelectAccount(account)}
              >
                <span className="account-name">{account.name}</span>
                <span className="account-type">{account.type}</span>
                {account.id === carrierAccount?.id && (
                  <svg className="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <style jsx>{styles}</style>
    </div>
  );
}

const styles = `
  .account-selector {
    margin-bottom: 16px;
  }

  .selector-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-bottom: 6px;
    font-weight: 500;
  }

  .selector-wrapper {
    position: relative;
  }

  .selector-button {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .selector-button:hover:not(:disabled) {
    border-color: var(--border-medium);
  }

  .selector-button.open {
    border-color: var(--color-accent);
  }

  .selector-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .selector-button.skeleton {
    background: linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .selected-name {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .chevron {
    width: 18px;
    height: 18px;
    color: var(--text-tertiary);
    transition: transform 0.2s ease;
  }

  .selector-button.open .chevron {
    transform: rotate(180deg);
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    z-index: 100;
    overflow: hidden;
    animation: slideDown 0.15s ease;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background 0.15s ease;
    text-align: left;
  }

  .dropdown-item:hover {
    background: var(--bg-hover);
  }

  .dropdown-item.selected {
    background: var(--bg-secondary);
  }

  .account-name {
    flex: 1;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .account-type {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    padding: 2px 6px;
    background: var(--bg-tertiary);
    border-radius: 4px;
  }

  .check-icon {
    width: 16px;
    height: 16px;
    color: var(--color-income);
    flex-shrink: 0;
  }
`;
