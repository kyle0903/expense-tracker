// TypeScript 類型定義

// 交易類型
export type TransactionType = "income" | "expense" | "transfer";

// 分類
export interface Category {
  id: string;
  name: string;
  icon: string;
  type: TransactionType;
}

// 帳戶
export interface Account {
  id: string;
  name: string; // 帳戶名稱
  type: string; // 帳戶類型
  initialBalance: number; // 初始金額
  transactionSum: number; // 交易加總
  balance: number; // 餘額
}

// 交易記錄
export interface Transaction {
  id?: string;
  name: string; // 名稱
  category: string; // 分類
  date: string; // 日期 (YYYY-MM-DD)
  amount: number; // 金額（正負表示收入/支出）
  account: string; // 帳戶
  note?: string; // 備註
}

// 收支摘要
export interface Summary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  byCategory: Record<string, number>;
}

// API 回應
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// 預設分類
export const DEFAULT_CATEGORIES: Category[] = [
  { id: "food", name: "餐飲", icon: "🍔", type: "expense" },
  { id: "transport", name: "交通", icon: "🚗", type: "expense" },
  { id: "shopping", name: "購物", icon: "🛒", type: "expense" },
  { id: "housing", name: "居住", icon: "🏠", type: "expense" },
  { id: "entertainment", name: "娛樂", icon: "🎮", type: "expense" },
  { id: "medical", name: "醫療", icon: "🏥", type: "expense" },
  { id: "education", name: "教育", icon: "📚", type: "expense" },
  { id: "other", name: "其他", icon: "📱", type: "expense" },
  { id: "salary", name: "薪資", icon: "💰", type: "income" },
  { id: "investment", name: "投資", icon: "📈", type: "income" },
  { id: "bonus", name: "獎金", icon: "🎁", type: "income" },
  { id: "other-income", name: "其他收入", icon: "💵", type: "income" },
];
