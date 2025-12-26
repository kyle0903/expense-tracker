import { Client } from '@notionhq/client';
import type { Transaction, Account, Summary } from '@/types';

// 初始化 Notion Client
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

// Database IDs
const TRANSACTIONS_DB_ID = process.env.NOTION_TRANSACTIONS_DB_ID!;
const ACCOUNTS_DB_ID = process.env.NOTION_ACCOUNTS_DB_ID!;

/**
 * 新增交易記錄到 Notion
 */
export async function createTransaction(transaction: Transaction): Promise<string> {
  const response = await notion.pages.create({
    parent: { database_id: TRANSACTIONS_DB_ID },
    properties: {
      '名稱': {
        title: [{ text: { content: transaction.name } }],
      },
      '分類': {
        select: { name: transaction.category },
      },
      '日期': {
        date: { start: transaction.date },
      },
      '金額': {
        number: transaction.amount,
      },
      '帳戶': {
        select: { name: transaction.account },
      },
      '備註': {
        rich_text: [{ text: { content: transaction.note || '' } }],
      },
    },
  });
  
  return response.id;
}

/**
 * 查詢交易記錄
 */
export async function getTransactions(
  startDate?: string,
  endDate?: string
): Promise<Transaction[]> {
  const filter: any = {};
  
  if (startDate && endDate) {
    filter.and = [
      {
        property: '日期',
        date: { on_or_after: startDate },
      },
      {
        property: '日期',
        date: { on_or_before: endDate },
      },
    ];
  }

  const response = await notion.databases.query({
    database_id: TRANSACTIONS_DB_ID,
    filter: startDate && endDate ? filter : undefined,
    sorts: [{ property: '日期', direction: 'descending' }],
    page_size: 100,
  });

  return response.results.map((page: any) => {
    const props = page.properties;
    return {
      id: page.id,
      name: props['名稱']?.title?.[0]?.text?.content || '',
      category: props['分類']?.select?.name || '',
      date: props['日期']?.date?.start || '',
      amount: props['金額']?.number || 0,
      account: props['帳戶']?.select?.name || '',
      note: props['備註']?.rich_text?.[0]?.text?.content || '',
    };
  });
}

/**
 * 查詢帳戶列表
 */
export async function getAccounts(): Promise<Account[]> {
  const response = await notion.databases.query({
    database_id: ACCOUNTS_DB_ID,
  });

  return response.results.map((page: any) => {
    const props = page.properties;
    return {
      id: page.id,
      name: props['帳戶名稱']?.title?.[0]?.text?.content || '',
      type: props['帳戶類型']?.select?.name || '',
      initialBalance: props['初始金額']?.number || 0,
      transactionSum: props['交易加總']?.formula?.number || props['交易加總']?.number || 0,
      balance: props['餘額']?.formula?.number || props['餘額']?.number || 0,
    };
  });
}

/**
 * 新增帳戶
 */
export async function createAccount(account: Omit<Account, 'id' | 'transactionSum' | 'balance'>): Promise<string> {
  const response = await notion.pages.create({
    parent: { database_id: ACCOUNTS_DB_ID },
    properties: {
      '帳戶名稱': {
        title: [{ text: { content: account.name } }],
      },
      '帳戶類型': {
        select: { name: account.type },
      },
      '初始金額': {
        number: account.initialBalance,
      },
    },
  });
  
  return response.id;
}

/**
 * 計算收支摘要
 */
export async function getSummary(year: number, month?: number): Promise<Summary> {
  let startDate: string;
  let endDate: string;

  if (month) {
    // 當月摘要
    startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
  } else {
    // 當年摘要
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;
  }

  const transactions = await getTransactions(startDate, endDate);

  let totalIncome = 0;
  let totalExpense = 0;
  const byCategory: Record<string, number> = {};

  for (const tx of transactions) {
    // 排除轉帳交易，不計入收支摘要
    if (tx.category === '轉帳') {
      continue;
    }

    if (tx.amount > 0) {
      totalIncome += tx.amount;
    } else {
      totalExpense += Math.abs(tx.amount);
    }

    if (tx.category) {
      byCategory[tx.category] = (byCategory[tx.category] || 0) + Math.abs(tx.amount);
    }
  }

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    byCategory,
  };
}

/**
 * 更新交易記錄
 */
export async function updateTransaction(
  id: string,
  transaction: Partial<Transaction>
): Promise<void> {
  const properties: any = {};

  if (transaction.name !== undefined) {
    properties['名稱'] = {
      title: [{ text: { content: transaction.name } }],
    };
  }
  if (transaction.category !== undefined) {
    properties['分類'] = {
      select: { name: transaction.category },
    };
  }
  if (transaction.date !== undefined) {
    properties['日期'] = {
      date: { start: transaction.date },
    };
  }
  if (transaction.amount !== undefined) {
    properties['金額'] = {
      number: transaction.amount,
    };
  }
  if (transaction.account !== undefined) {
    properties['帳戶'] = {
      select: { name: transaction.account },
    };
  }
  if (transaction.note !== undefined) {
    properties['備註'] = {
      rich_text: [{ text: { content: transaction.note || '' } }],
    };
  }

  await notion.pages.update({
    page_id: id,
    properties,
  });
}

/**
 * 刪除交易記錄（移至垃圾桶）
 */
export async function deleteTransaction(id: string): Promise<void> {
  await notion.pages.update({
    page_id: id,
    archived: true,
  });
}

/**
 * 根據帳戶名稱查詢交易記錄
 */
export async function getTransactionsByAccount(
  accountName: string
): Promise<Transaction[]> {
  const response = await notion.databases.query({
    database_id: TRANSACTIONS_DB_ID,
    filter: {
      property: '帳戶',
      select: { equals: accountName },
    },
    sorts: [{ property: '日期', direction: 'descending' }],
  });

  return response.results.map((page: any) => {
    const props = page.properties;
    return {
      id: page.id,
      name: props['名稱']?.title?.[0]?.text?.content || '',
      category: props['分類']?.select?.name || '',
      date: props['日期']?.date?.start || '',
      amount: props['金額']?.number || 0,
      account: props['帳戶']?.select?.name || '',
      note: props['備註']?.rich_text?.[0]?.text?.content || '',
    };
  });
}

/**
 * 根據帳戶 ID 取得帳戶資訊
 */
export async function getAccountById(id: string): Promise<Account | null> {
  try {
    const page = await notion.pages.retrieve({ page_id: id }) as any;
    const props = page.properties;
    return {
      id: page.id,
      name: props['帳戶名稱']?.title?.[0]?.text?.content || '',
      type: props['帳戶類型']?.select?.name || '',
      initialBalance: props['初始金額']?.number || 0,
      transactionSum: props['交易加總']?.formula?.number || props['交易加總']?.number || 0,
      balance: props['餘額']?.formula?.number || props['餘額']?.number || 0,
    };
  } catch {
    return null;
  }
}
