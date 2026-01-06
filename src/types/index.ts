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
  { id: "transfer", name: "轉帳", icon: "🔄", type: "transfer" },
];

// 分類名稱建議
export const CATEGORY_SUGGESTIONS: Record<string, string[]> = {
  "餐飲": ["早餐", "午餐", "晚餐", "宵夜", "飲料", "咖啡", "外送"],
  "交通": ["加油費", "捷運", "公車", "停車費", "高鐵", "火車", "Uber"],
  "購物": ["日用品", "服飾", "3C產品", "網購", "超市"],
  "居住": ["房租", "水費", "電費", "瓦斯費", "網路費", "管理費"],
  "娛樂": ["電影", "遊戲", "訂閱", "KTV", "旅遊", "運動", "韓團周邊"],
  "醫療": ["看診", "藥品", "保健食品", "牙醫"],
  "教育": ["課程", "書籍", "文具", "補習費"],
  "其他": ["手續費", "保險", "禮物", "捐款"],
  "工作": ["月薪", "兼職", "季獎金", "年終", "績效獎金", "分紅"],
  "投資": ["股息", "利息", "租金收入"],
  "額外": ["退款", "中獎", "回饋金"],
};
