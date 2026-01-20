# 💰 Notion 記帳 (Expense Tracker)

一個整合 Notion 資料庫的個人記帳 PWA 應用程式，支援電子發票自動匯入與 AI 智慧分類。

![Next.js](https://img.shields.io/badge/Next.js-16.1-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Python](https://img.shields.io/badge/Python-FastAPI-green?logo=python)
![Notion](https://img.shields.io/badge/Notion-API-white?logo=notion)

## ✨ 功能特色

### 📝 快速記帳

- **多種記帳模式**：支出、收入、轉帳、代墊還款
- **智慧分類**：餐飲、交通、購物、日常、娛樂、醫療、教育、其他等多種分類
- **分類建議**：根據分類自動建議常用名稱
- **帳戶管理**：支援多帳戶記錄與餘額追蹤
- **數字鍵盤**：行動裝置友善的數字輸入介面

### 🧾 電子發票同步

- **自動爬取**：從財政部電子發票平台自動取得手機載具發票
- **AI 分類**：使用 OpenAI GPT-4.1 mini 智慧判斷消費名稱與分類
- **進度追蹤**：SSE 即時串流顯示同步進度
- **重複檢測**：自動跳過已匯入的發票

### 📊 統計報表

- **月度摘要**：收入/支出總覽與分類統計
- **分類篩選**：可分別查看支出或收入的分類明細
- **交易列表**：按類型篩選（全部/支出/收入/轉帳）

### 🔐 安全性

- **PIN 碼保護**：應用程式啟動時需輸入 PIN 碼驗證
- **API 認證**：所有 API 請求需經過認證中間件

### 📱 PWA 支援

- **離線可用**：支援 Service Worker 快取
- **可安裝**：可新增至手機主畫面
- **響應式設計**：針對行動裝置最佳化

---

## 🏗️ 專案架構

```
expense-tracker/
├── src/                          # Next.js 前端原始碼
│   ├── app/                      # App Router 頁面
│   │   ├── api/                  # API Routes
│   │   │   ├── accounts/         # 帳戶 API
│   │   │   ├── auth/             # 認證 API
│   │   │   ├── invoices/         # 發票 API
│   │   │   ├── summary/          # 摘要統計 API
│   │   │   ├── transactions/     # 交易記錄 API
│   │   │   └── transfer/         # 轉帳 API
│   │   ├── accounts/             # 帳戶頁面
│   │   ├── invoices/             # 發票同步頁面
│   │   ├── summary/              # 統計摘要頁面
│   │   ├── transactions/         # 交易記錄頁面
│   │   ├── layout.tsx            # 根版面配置
│   │   ├── page.tsx              # 首頁（快速記帳）
│   │   └── globals.css           # 全域樣式
│   ├── components/               # React 元件
│   │   ├── AuthProvider.tsx      # 認證 Context Provider
│   │   ├── InvoiceAccountSelector.tsx  # 發票帳戶選擇器
│   │   ├── Navigation.tsx        # 底部導航列
│   │   ├── PinGate.tsx           # PIN 碼驗證閘門
│   │   ├── QuickEntry.tsx        # 快速記帳主元件
│   │   └── TransactionList.tsx   # 交易列表元件
│   ├── hooks/                    # 自訂 Hooks
│   │   └── useAuthFetch.ts       # 帶認證的 fetch Hook
│   ├── lib/                      # 工具函式
│   │   ├── auth.ts               # 認證工具
│   │   └── notion.ts             # Notion API 封裝
│   └── types/                    # TypeScript 類型定義
│       └── index.ts
│
├── invoice-scraper/              # Python 發票爬蟲服務
│   ├── main.py                   # FastAPI 主程式
│   ├── einvoice_scraper.py       # 電子發票爬蟲核心
│   ├── notion_service.py         # Notion 整合服務
│   ├── category_classifier.py    # OpenAI 分類器
│   ├── Dockerfile                # Docker 容器配置
│   └── requirements.txt          # Python 依賴
│
├── .github/
│   └── workflows/
│       └── keep-alive.yml        # GitHub Actions 保活服務
│
└── public/                       # 靜態資源
```

---

## 🚀 快速開始

### 環境需求

- Node.js 20+
- Python 3.11+
- Notion 帳號及 API Key
- OpenAI API Key（發票分類用）

### 1. 安裝依賴

```bash
# 前端
npm install

# 發票爬蟲服務
cd invoice-scraper
pip install -r requirements.txt
```

### 2. 環境變數設定

複製 `env.example.txt` 為 `.env.local` 並填入設定值：

```env
# Notion API 設定
NOTION_API_KEY=your_notion_api_key_here
NOTION_TRANSACTIONS_DB_ID=your_transactions_database_id
NOTION_ACCOUNTS_DB_ID=your_accounts_database_id
```

發票爬蟲服務另需設定 `invoice-scraper/.env`：

```env
# 電子發票平台帳號
EINVOICE_PHONE=your_phone_number
EINVOICE_PASSWORD=your_password

# OpenAI API Key (用於驗證碼辨識及分類)
OPENAI_API_KEY=your_openai_api_key

# Notion 設定
NOTION_API_KEY=your_notion_api_key
NOTION_TRANSACTIONS_DB_ID=your_transactions_database_id
NOTION_ACCOUNTS_DB_ID=your_accounts_database_id
```

### 3. 執行開發伺服器

```bash
# 前端 (http://localhost:3000)
npm run dev

# 發票爬蟲 API (http://localhost:8000)
cd invoice-scraper
uvicorn main:app --reload
```

---

## 📦 部署

### 前端 (Vercel)

```bash
npm run build
# 推送至 GitHub 後連結 Vercel 自動部署
```

### 發票爬蟲服務 (Render/Docker)

```bash
cd invoice-scraper
docker build -t expense-tracker-scraper .
docker run -p 8000:8000 expense-tracker-scraper
```

---

## 🔧 Notion 資料庫設定

### 交易記錄資料庫 (Transactions)

| 欄位名稱 | 類型      | 說明                                                                           |
| -------- | --------- | ------------------------------------------------------------------------------ |
| 名稱     | Title     | 交易名稱                                                                       |
| 分類     | Select    | 餐飲/交通/購物/日常/娛樂/醫療/教育/其他/工作/投資/報銷/額外/轉帳/代墊/代墊還款 |
| 日期     | Date      | 交易日期時間                                                                   |
| 金額     | Number    | 金額（正=收入，負=支出）                                                       |
| 帳戶     | Relation  | 關聯至帳戶資料庫                                                               |
| 備註     | Rich Text | 備註說明                                                                       |
| 發票號碼 | Rich Text | 電子發票號碼（可選）                                                           |

### 帳戶資料庫 (Accounts)

| 欄位名稱 | 類型     | 說明                       |
| -------- | -------- | -------------------------- |
| 帳戶名稱 | Title    | 帳戶名稱                   |
| 帳戶類型 | Select   | 現金/銀行/信用卡/電子支付  |
| 初始金額 | Number   | 帳戶初始金額               |
| 載具帳戶 | Checkbox | 是否為電子發票載具預設帳戶 |

---

## 🛠️ 技術棧

### 前端

- **框架**: Next.js 16 (App Router)
- **UI**: React 19 + TailwindCSS 4
- **PWA**: @ducanh2912/next-pwa
- **語言**: TypeScript 5

### 後端

- **API**: Next.js API Routes + FastAPI (Python)
- **資料庫**: Notion Database
- **爬蟲**: Selenium + OpenAI Vision API

### DevOps

- **CI/CD**: GitHub Actions
- **保活**: Cron Job 每 14 分鐘 ping 服務

---

## 📄 授權

MIT License

---

## 👤 作者

Kyle - [GitHub](https://github.com/kyle0903)
