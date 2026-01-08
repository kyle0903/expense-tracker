/**
 * 認證模組
 * 用於 PIN 碼驗證和加密存儲
 */

/**
 * 使用 SHA-256 雜湊 PIN 碼
 * 瀏覽器端使用 Web Crypto API
 */
export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * 驗證 PIN 碼
 */
export async function verifyPin(inputPin: string, hashedPin: string): Promise<boolean> {
  const inputHash = await hashPin(inputPin);
  return inputHash === hashedPin;
}

// localStorage 鍵值
const AUTH_KEY = 'expense_tracker_auth';

/**
 * 儲存認證狀態（已雜湊的 PIN）
 */
export function saveAuthToken(hashedPin: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(AUTH_KEY, hashedPin);
  }
}

/**
 * 取得已儲存的認證 token
 */
export function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(AUTH_KEY);
  }
  return null;
}

/**
 * 清除認證狀態（登出）
 */
export function clearAuthToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(AUTH_KEY);
  }
}

/**
 * 檢查是否已認證
 */
export function isAuthenticated(): boolean {
  return getAuthToken() !== null;
}
