'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { useAccounts } from '@/hooks/useAccounts';
import type { Account } from '@/types';

interface InvoiceAccountSelectorProps {
  disabled?: boolean;
}

export default function InvoiceAccountSelector({ disabled }: InvoiceAccountSelectorProps) {
  const { accounts, isLoading: loading, mutate: mutateAccounts } = useAccounts();
  const authFetch = useAuthFetch();
  const [saving, setSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const carrierAccount = accounts.find(a => a.isCarrierAccount) || null;

  // 點擊外部關閉下拉選單
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 設定載具帳戶
  const handleSelectAccount = async (account: Account) => {
    if (account.id === carrierAccount?.id) {
      setIsOpen(false);
      return;
    }

    setSaving(true);
    setIsOpen(false);
    try {
      const res = await authFetch('/api/accounts/carrier', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id }),
      });
      const data = await res.json();
      if (data.success) {
        mutateAccounts(); // 重新驗證帳戶資料
      }
    } catch {
      // 靜默處理錯誤
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="carrier-selector-card" ref={wrapperRef}>
      <div className="carrier-header">
        <span className="carrier-label">綁定帳戶</span>
        <button
          className={`carrier-select ${isOpen ? 'open' : ''} ${loading ? 'loading' : ''}`}
          onClick={() => !disabled && !saving && !loading && setIsOpen(!isOpen)}
          disabled={disabled || saving || loading}
        >
          <span className="carrier-value">
            {loading ? '載入中' : saving ? '儲存中' : carrierAccount?.name || '未設定'}
          </span>
          <svg className="carrier-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div className="carrier-dropdown">
          {accounts.map((account) => (
            <button
              key={account.id}
              className={`carrier-option ${account.id === carrierAccount?.id ? 'active' : ''}`}
              onClick={() => handleSelectAccount(account)}
            >
              <div className="option-info">
                <span className="option-name">{account.name}</span>
                <span className="option-type">{account.type}</span>
              </div>
              {account.id === carrierAccount?.id && (
                <svg className="option-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}

      <style jsx>{`
        .carrier-selector-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-light);
          border-radius: 12px;
          padding: 12px 16px;
          margin-bottom: 16px;
          position: relative;
        }

        .carrier-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .carrier-label {
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .carrier-select {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          background: var(--bg-tertiary);
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .carrier-select:hover:not(:disabled) {
          background: var(--bg-hover);
        }

        .carrier-select:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .carrier-select.loading .carrier-value {
          color: var(--text-tertiary);
        }

        .carrier-value {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .carrier-chevron {
          width: 14px;
          height: 14px;
          color: var(--text-tertiary);
          transition: transform 0.2s ease;
        }

        .carrier-select.open .carrier-chevron {
          transform: rotate(180deg);
        }

        .carrier-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          right: 0;
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
          z-index: 100;
          overflow: hidden;
          animation: dropIn 0.15s ease;
        }

        @keyframes dropIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .carrier-option {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border-light);
          cursor: pointer;
          transition: background 0.1s ease;
          text-align: left;
        }

        .carrier-option:last-child {
          border-bottom: none;
        }

        .carrier-option:hover {
          background: var(--bg-hover);
        }

        .carrier-option:active {
          background: var(--bg-active);
        }

        .carrier-option.active {
          background: var(--bg-secondary);
        }

        .option-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .option-name {
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--text-primary);
        }

        .option-type {
          font-size: 0.75rem;
          color: var(--text-tertiary);
        }

        .option-check {
          width: 18px;
          height: 18px;
          color: var(--color-income);
          flex-shrink: 0;
        }

        @media (prefers-color-scheme: dark) {
          .carrier-dropdown {
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
          }
        }
      `}</style>
    </div>
  );
}
