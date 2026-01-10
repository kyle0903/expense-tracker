'use client';

import { useState } from 'react';
import type { Transaction, Account } from '@/types';
import { DEFAULT_CATEGORIES } from '@/types';

interface TransactionListProps {
  transactions: Transaction[];
  accounts?: Account[];
  onUpdate?: (transaction: Transaction) => void;
  onDelete?: (id: string) => void;
  showActions?: boolean;
}

export function TransactionList({
  transactions,
  accounts = [],
  onUpdate,
  onDelete,
  showActions = true,
}: TransactionListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Transaction>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const expenseCategories = DEFAULT_CATEGORIES.filter(c => c.type === 'expense');
  const incomeCategories = DEFAULT_CATEGORIES.filter(c => c.type === 'income');

  // 格式化日期時間顯示 (將 ISO 格式轉換為易讀的 MM/DD HH:mm)
  const formatDateTime = (dateStr: string): string => {
    if (!dateStr) return '';

    try {
      // 嘗試解析為 Date 物件
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return dateStr; // 無法解析，直接返回原字串
      }

      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');

      // 如果時間是 00:00，只顯示日期
      if (hours === '00' && minutes === '00') {
        return `${month}/${day}`;
      }

      return `${month}/${day} ${hours}:${minutes}`;
    } catch {
      return dateStr;
    }
  };

  // 將日期轉換為 datetime-local input 可用的格式 (YYYY-MM-DDTHH:MM)
  const toDateTimeLocalValue = (dateStr: string): string => {
    if (!dateStr) return '';

    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        // 如果是純日期格式 YYYY-MM-DD，加上預設時間
        if (dateStr.length === 10) {
          return `${dateStr}T00:00`;
        }
        return '';
      }

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');

      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch {
      return '';
    }
  };

  // 將 datetime-local 值轉換為 ISO 格式
  const fromDateTimeLocalValue = (value: string): string => {
    if (!value) return '';
    // datetime-local 格式為 YYYY-MM-DDTHH:MM，直接加上時區標記
    return `${value}:00+08:00`;
  };

  const handleEdit = (tx: Transaction) => {
    setEditingId(tx.id || null);
    setEditForm({
      name: tx.name,
      category: tx.category,
      date: toDateTimeLocalValue(tx.date), // 轉換為 datetime-local 格式
      amount: tx.amount,
      account: tx.account,
      note: tx.note,
    });
  };

  const handleSave = async () => {
    if (!editingId || !onUpdate) return;

    setSavingId(editingId);
    try {
      // 將 datetime-local 格式轉換為 ISO 格式再儲存
      const dateToSave = editForm.date ? fromDateTimeLocalValue(editForm.date) : '';

      await onUpdate({
        id: editingId,
        ...editForm as Transaction,
        date: dateToSave,
      });
      setEditingId(null);
      setEditForm({});
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!onDelete) return;
    setDeletingId(id);
    await onDelete(id);
    setDeletingId(null);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
  };

  if (transactions.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '40px 20px',
        color: 'var(--text-tertiary)',
      }}>
        尚無交易記錄
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {transactions.map((tx, index) => {
        const isEditing = editingId === tx.id;
        const isDeleting = deletingId === tx.id;
        const isSaving = savingId === tx.id;
        const isExpense = (editForm.amount ?? tx.amount) < 0;
        const categories = isExpense ? expenseCategories : incomeCategories;

        return (
          <div
            key={tx.id || index}
            style={{
              borderBottom: index < transactions.length - 1 ? '1px solid var(--border-light)' : 'none',
            }}
          >
            {isEditing ? (
              /* 編輯模式 */
              <div style={{ padding: '12px 16px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="名稱"
                    value={editForm.name || ''}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    style={{ marginBottom: '8px' }}
                  />
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <select
                      className="input"
                      value={editForm.category || ''}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                      style={{ flex: 1 }}
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.name}>{cat.icon} {cat.name}</option>
                      ))}
                    </select>
                    {accounts.length > 0 && (
                      <select
                        className="input"
                        value={editForm.account || ''}
                        onChange={(e) => setEditForm({ ...editForm, account: e.target.value })}
                        style={{ flex: 1 }}
                      >
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.name}>{acc.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                      type="datetime-local"
                      className="input"
                      value={editForm.date || ''}
                      onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                      style={{ flex: 1 }}
                    />
                    <input
                      type="number"
                      className="input"
                      placeholder="金額"
                      value={editForm.amount || ''}
                      onChange={(e) => setEditForm({ ...editForm, amount: parseFloat(e.target.value) || 0 })}
                      style={{ flex: 1 }}
                    />
                  </div>
                  <input
                    type="text"
                    className="input"
                    placeholder="備註（選填）"
                    value={editForm.note || ''}
                    onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleCancel}
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    disabled={isSaving}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSave}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    disabled={isSaving}
                  >
                    {isSaving ? '儲存中...' : '儲存'}
                  </button>
                </div>
              </div>
            ) : (
              /* 顯示模式 */
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  opacity: isDeleting ? 0.5 : 1,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{tx.name}</div>
                  <div style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    marginTop: '2px',
                  }}>
                    {tx.category} · {tx.account} · {formatDateTime(tx.date)}
                  </div>
                </div>
                <div
                  className={`amount ${tx.amount >= 0 ? 'amount-income' : 'amount-expense'}`}
                  style={{ marginRight: showActions ? '12px' : 0 }}
                >
                  {tx.amount >= 0 ? '+' : ''}${Math.abs(tx.amount).toLocaleString()}
                </div>
                {showActions && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => handleEdit(tx)}
                      className="btn btn-secondary"
                      style={{
                        padding: '6px 10px',
                        fontSize: '0.75rem',
                        minWidth: 'auto',
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => tx.id && handleDelete(tx.id)}
                      disabled={isDeleting}
                      className="btn btn-secondary"
                      style={{
                        padding: '6px 10px',
                        fontSize: '0.75rem',
                        minWidth: 'auto',
                        color: 'var(--color-expense)',
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
