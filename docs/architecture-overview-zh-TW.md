# Expense Tracker 架構說明（給目前版本的你）

這份文件的目標：
- 先讓你知道「每個資料夾在做什麼」
- 再讓你知道「登入和 API 為什麼拆成多個檔案」
- 最後給你一個實際的閱讀順序，避免越看越亂

## 1. 先用一句話理解 Next.js App Router

在 Next.js（App Router）裡，前端頁面和後端 API 可以放在同一個專案中：
- `src/app/**/page.tsx` 是前端頁面
- `src/app/api/**/route.ts` 是後端 API

所以你看到「API 檔案跟前端檔案很近」是正常設計，不是混亂。

## 2. 你專案的資料夾職責（心智模型）

- `src/app`：路由入口層（頁面與 API）
- `src/components`：畫面元件與全域狀態容器（例如 `AuthProvider`）
- `src/hooks`：可重用的前端行為（例如 `useAuthFetch`）
- `src/lib`：純工具與服務邏輯（不依賴 UI）
- `src/types`：型別定義

把它想成 4 層：
1. 路由層（app）
2. 畫面/狀態層（components）
3. 可重用行為層（hooks）
4. 工具/服務層（lib）

## 3. 為什麼登入要拆成多個檔案

你現在看到的拆分其實是「單一職責」：

- `src/components/AuthProvider.tsx`
  - 管理登入狀態（`isAuthenticated`、`token`、`login/logout`）
  - 提供 React Context 給整個前端使用

- `src/lib/auth.ts`
  - 提供 auth 工具函式（localStorage 存取、hash 等）
  - 不碰 UI，專心做工具

- `src/hooks/useAuthFetch.ts`
  - 包裝 `fetch`，自動帶 `Authorization` header
  - 避免每個頁面都手動重寫 token header

- `src/app/api/auth/route.ts`
  - 後端登入驗證 API（驗 PIN、回 token、驗 token）

- `src/lib/auth-middleware.ts`
  - 後端保護 API 的共用檢查（驗 `Authorization`）

這樣拆的好處：
- 每個檔案目的清楚
- 改某個功能時影響範圍小
- 比較不容易「一個檔案塞滿所有事」

## 4. 一次看懂登入流程（實際資料流）

### 4.1 使用者輸入 PIN（前端）
- `PinGate` / `AuthProvider` 呼叫 `POST /api/auth`

### 4.2 後端驗 PIN（API）
- `src/app/api/auth/route.ts` 驗證成功後回傳 token（目前是 PIN 的 hash）

### 4.3 前端保存登入狀態
- `AuthProvider` 把 token 存到 localStorage（透過 `src/lib/auth.ts`）
- `AuthProvider` 把 token 放進 Context，讓全 app 可讀

### 4.4 前端打其他 API
- 各頁面用 `useAuthFetch`
- `useAuthFetch` 自動在 header 帶 `Authorization: Bearer <token>`

### 4.5 後端保護資料 API
- `src/app/api/accounts/route.ts`、`src/app/api/transactions/route.ts` 等
- 會呼叫 `verifyAuthHeader`（`src/lib/auth-middleware.ts`）檢查 token

## 5. 為什麼會覺得「API 跟前端有關係」

因為在這個架構中，前後端本來就同專案協作：
- 前端頁面負責「發請求 + 顯示資料」
- API 路由負責「驗證 + 讀寫資料（例如 Notion）」

它們不是混在一起，而是「同一個 repo 裡的兩個角色」。

## 6. 你可以這樣閱讀專案（建議順序）

第一次理解時，照這個順序：
1. `src/app/layout.tsx`（看 Provider 怎麼包整站）
2. `src/components/AuthProvider.tsx`（看登入狀態怎麼管理）
3. `src/hooks/useAuthFetch.ts`（看 API 請求怎麼帶 token）
4. `src/app/api/auth/route.ts`（看 token 怎麼發、怎麼驗）
5. `src/lib/auth-middleware.ts`（看保護機制）
6. `src/app/accounts/page.tsx`（看頁面如何實際呼叫）

## 7. 快速判斷：東西應該放哪裡？

- 會影響 UI 畫面與 state：`components`
- 只是重用前端邏輯（尤其是 hook 形式）：`hooks`
- 純工具、和 UI 無關：`lib`
- 需要 URL 路由（頁面/API）：`app`

## 8. 目前專案的簡化總結

你可以把整個系統記成一句話：

「`AuthProvider` 管登入狀態，`useAuthFetch` 幫你帶 token，`/api/*` 用 middleware 驗 token，頁面只要專心顯示和互動。」

如果你先把這句話記住，再回頭看檔案，理解速度會快很多。
