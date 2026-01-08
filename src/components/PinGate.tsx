'use client';

import { useState } from 'react';
import { useAuth } from './AuthProvider';

export function PinGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 載入中
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-primary)',
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid var(--border-light)',
          borderTopColor: 'var(--text-primary)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <style jsx>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // 已認證，顯示子元件
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // 處理提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || isSubmitting) return;

    setIsSubmitting(true);
    setError('');

    const result = await login(pin);
    
    if (!result.success) {
      setError(result.error || 'PIN 碼錯誤');
      setPin('');
    }
    
    setIsSubmitting(false);
  };

  // PIN 輸入畫面
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      padding: '20px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '320px',
        textAlign: 'center',
      }}>
        {/* Logo/Title */}
        <div style={{
          fontSize: '3rem',
          marginBottom: '8px',
        }}>
          💰
        </div>
        <h1 style={{
          fontSize: '1.5rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '8px',
        }}>
          記帳本
        </h1>
        <p style={{
          fontSize: '0.875rem',
          color: 'var(--text-secondary)',
          marginBottom: '32px',
        }}>
          請輸入 PIN 碼以繼續
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="輸入 PIN 碼"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
            autoComplete="off"
            style={{
              width: '100%',
              padding: '16px',
              fontSize: '1.5rem',
              textAlign: 'center',
              letterSpacing: '0.5em',
              border: error ? '2px solid var(--color-expense)' : '2px solid var(--border-medium)',
              borderRadius: '12px',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              outline: 'none',
              marginBottom: '16px',
            }}
          />

          {error && (
            <div style={{
              color: 'var(--color-expense)',
              fontSize: '0.875rem',
              marginBottom: '16px',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!pin || isSubmitting}
            style={{
              width: '100%',
              padding: '16px',
              fontSize: '1rem',
              fontWeight: 600,
              border: 'none',
              borderRadius: '12px',
              background: pin && !isSubmitting ? 'var(--text-primary)' : 'var(--bg-tertiary)',
              color: pin && !isSubmitting ? 'var(--bg-primary)' : 'var(--text-tertiary)',
              cursor: pin && !isSubmitting ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
            }}
          >
            {isSubmitting ? '驗證中...' : '解鎖'}
          </button>
        </form>
      </div>
    </div>
  );
}
