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

// 分攤付款資訊
export interface SplitPaymentInfo {
  isEnabled: boolean; // 是否啟用代墊模式
  totalPeople?: number; // 總人數（包含自己）
  splitAmount?: number; // 代墊金額（他人應還的部分）
  ownAmount?: number; // 自己真正的支出
}

// 帳戶
export interface Account {
  id: string;
  name: string; // 帳戶名稱
  type: string; // 帳戶類型
  initialBalance: number; // 初始金額
  transactionSum: number; // 交易加總
  balance: number; // 餘額
  isCarrierAccount: boolean; // 是否為載具帳戶
}

// 交易記錄
export interface Transaction {
  id?: string;
  name: string; // 名稱
  category: string; // 分類
  date: string; // 日期 (YYYY-MM-DD 或 ISO 8601 完整格式)
  amount: number; // 金額（正負表示收入/支出）
  account: string; // 帳戶
  note?: string; // 備註
}

// 收支摘要
export interface Summary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  byCategory: Record<string, number>; // 保留向後兼容
  byCategoryExpense: Record<string, number>; // 支出分類統計
  byCategoryIncome: Record<string, number>; // 收入分類統計
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
  { id: "housing", name: "日常", icon: "🏠", type: "expense" },
  { id: "entertainment", name: "娛樂", icon: "🎮", type: "expense" },
  { id: "medical", name: "醫療", icon: "🏥", type: "expense" },
  { id: "education", name: "學習", icon: "📚", type: "expense" },
  { id: "subscription", name: "訂閱", icon: "📱", type: "expense" },
  { id: "other", name: "其他", icon: "💬", type: "expense" },
  { id: "salary", name: "工作", icon: "💰", type: "income" },
  { id: "investment", name: "投資", icon: "📈", type: "income" },
  { id: "reimbursement", name: "報銷", icon: "🧳", type: "income" },
  { id: "other-income", name: "額外", icon: "💵", type: "income" },
  { id: "transfer", name: "轉帳", icon: "🔄", type: "transfer" },
  { id: "advance", name: "代墊", icon: "💳", type: "transfer" },
  { id: "repayment", name: "代墊還款", icon: "🤝", type: "transfer" },
];

// 分類名稱建議
export const CATEGORY_SUGGESTIONS: Record<string, string[]> = {
  餐飲: ["早餐", "午餐", "晚餐", "零食", "宵夜", "飲料", "咖啡", "外送"],
  交通: ["加油費", "捷運", "公車", "停車費", "高鐵", "火車", "Uber"],
  購物: ["日用品", "服飾", "3C產品", "網購", "超市"],
  日常: ["手機費", "房租", "水費", "電費", "瓦斯費", "網路費", "管理費"],
  娛樂: ["電影", "遊戲", "KTV", "旅遊", "運動", "韓團周邊"],
  醫療: ["看診", "藥品", "保健食品", "牙醫"],
  學習: ["課程", "書籍"],
  訂閱: ["Netflix", "Spotify", "ChatGPT", "Google One", "Claude"],
  其他: ["手續費", "保險", "禮物", "捐款"],
  工作: ["月薪", "兼職", "季獎金", "年終", "績效獎金", "分紅"],
  投資: ["股息", "利息", "租金收入"],
  報銷: ["AI工具補助", "運動補助", "零食補助"],
  額外: ["中獎", "回饋"],
};
