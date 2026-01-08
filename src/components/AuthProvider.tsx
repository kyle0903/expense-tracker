'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { getAuthToken, saveAuthToken, clearAuthToken } from '@/lib/auth';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  token: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  // 初始化時檢查是否已認證
  useEffect(() => {
    async function checkAuth() {
      const savedToken = getAuthToken();
      
      if (!savedToken) {
        setIsLoading(false);
        return;
      }

      // 驗證 token 是否仍然有效
      try {
        const res = await fetch('/api/auth', {
          headers: {
            'Authorization': `Bearer ${savedToken}`,
          },
        });
        const data = await res.json();
        
        if (data.success && data.authenticated) {
          setIsAuthenticated(true);
          setToken(savedToken);
        } else {
          // Token 無效，清除
          clearAuthToken();
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        clearAuthToken();
      }
      
      setIsLoading(false);
    }

    checkAuth();
  }, []);

  // 登入
  const login = async (pin: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();

      if (data.success && data.token) {
        saveAuthToken(data.token);
        setToken(data.token);
        setIsAuthenticated(true);
        return { success: true };
      } else {
        return { success: false, error: data.error || 'PIN 碼錯誤' };
      }
    } catch (error) {
      console.error('Login failed:', error);
      return { success: false, error: '登入失敗，請稍後再試' };
    }
  };

  // 登出
  const logout = () => {
    clearAuthToken();
    setToken(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout, token }}>
      {children}
    </AuthContext.Provider>
  );
}
