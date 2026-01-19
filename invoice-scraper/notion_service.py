"""
Notion API 服務
使用 requests 直接呼叫 Notion HTTP API
"""

import os
import requests
from dotenv import load_dotenv

load_dotenv()


class NotionService:
    """Notion API 操作"""
    
    BASE_URL = "https://api.notion.com/v1"
    
    def __init__(self):
        self.api_key = os.getenv("NOTION_API_KEY")
        self.transactions_db_id = os.getenv("NOTION_TRANSACTIONS_DB_ID")
        self.accounts_db_id = os.getenv("NOTION_ACCOUNTS_DB_ID")
        
        if not self.api_key:
            raise ValueError("缺少 NOTION_API_KEY 環境變數")
        if not self.transactions_db_id:
            raise ValueError("缺少 NOTION_TRANSACTIONS_DB_ID 環境變數")
        
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28"
        }
        
        # 快取帳戶 ID
        self._account_cache = {}
    
    def _query_database(self, database_id: str, filter_obj: dict = None) -> list:
        """查詢資料庫"""
        url = f"{self.BASE_URL}/databases/{database_id}/query"
        payload = {}
        if filter_obj:
            payload["filter"] = filter_obj
        
        response = requests.post(url, headers=self.headers, json=payload)
        
        if response.status_code != 200:
            raise Exception(f"Notion API 錯誤: {response.status_code} - {response.text}")
        
        return response.json().get("results", [])
    
    def _create_page(self, database_id: str, properties: dict) -> str:
        """建立頁面"""
        url = f"{self.BASE_URL}/pages"
        payload = {
            "parent": {"database_id": database_id},
            "properties": properties
        }
        
        response = requests.post(url, headers=self.headers, json=payload)
        
        if response.status_code != 200:
            raise Exception(f"Notion API 錯誤: {response.status_code} - {response.text}")
        
        return response.json()["id"]
    
    def get_account_id(self, account_name: str) -> str:
        """根據帳戶名稱取得帳戶頁面 ID"""
        if account_name in self._account_cache:
            return self._account_cache[account_name]

        if not self.accounts_db_id:
            raise ValueError("缺少 NOTION_ACCOUNTS_DB_ID 環境變數")

        results = self._query_database(
            self.accounts_db_id,
            {
                "property": "帳戶名稱",
                "title": {"equals": account_name}
            }
        )

        if results:
            account_id = results[0]["id"]
            self._account_cache[account_name] = account_id
            return account_id
        else:
            raise ValueError(f"找不到帳戶: {account_name}")

    def get_carrier_account(self) -> str:
        """取得被標記為載具帳戶的帳戶名稱，若無則回傳 Unicard"""
        if not self.accounts_db_id:
            return "Unicard"

        try:
            results = self._query_database(
                self.accounts_db_id,
                {
                    "property": "載具帳戶",
                    "checkbox": {"equals": True}
                }
            )

            if results:
                props = results[0].get("properties", {})
                if props.get("帳戶名稱", {}).get("title"):
                    return props["帳戶名稱"]["title"][0].get("text", {}).get("content", "Unicard")

            return "Unicard"
        except Exception:
            return "Unicard"
    
    def invoice_exists(self, invoice_number: str) -> bool:
        """檢查發票是否已存在"""
        try:
            results = self._query_database(
                self.transactions_db_id,
                {
                    "property": "發票號碼",
                    "rich_text": {"contains": invoice_number}
                }
            )
            return len(results) > 0
        except Exception:
            return False

    def get_invoices_for_month(self, year: int = None, month: int = None) -> list:
        """取得指定月份有發票號碼的交易記錄"""
        from datetime import datetime

        if year is None or month is None:
            now = datetime.now()
            year = now.year
            month = now.month

        # 計算該月的起始和結束日期
        start_date = f"{year}-{month:02d}-01"
        if month == 12:
            end_date = f"{year + 1}-01-01"
        else:
            end_date = f"{year}-{month + 1:02d}-01"

        # 查詢該月份有發票號碼的記錄
        url = f"{self.BASE_URL}/databases/{self.transactions_db_id}/query"
        payload = {
            "filter": {
                "and": [
                    {
                        "property": "發票號碼",
                        "rich_text": {"is_not_empty": True}
                    },
                    {
                        "property": "日期",
                        "date": {"on_or_after": start_date}
                    },
                    {
                        "property": "日期",
                        "date": {"before": end_date}
                    }
                ]
            },
            "sorts": [
                {
                    "property": "日期",
                    "direction": "descending"
                }
            ]
        }

        response = requests.post(url, headers=self.headers, json=payload)

        if response.status_code != 200:
            raise Exception(f"Notion API 錯誤: {response.status_code} - {response.text}")

        results = response.json().get("results", [])

        # 解析結果
        invoices = []
        for page in results:
            props = page.get("properties", {})

            # 取得各欄位值
            invoice_number = ""
            if props.get("發票號碼", {}).get("rich_text"):
                invoice_number = props["發票號碼"]["rich_text"][0].get("text", {}).get("content", "")

            if not invoice_number:
                continue

            name = ""
            if props.get("名稱", {}).get("title"):
                name = props["名稱"]["title"][0].get("text", {}).get("content", "")

            category = ""
            if props.get("分類", {}).get("select"):
                category = props["分類"]["select"].get("name", "")

            date_str = ""
            if props.get("日期", {}).get("date"):
                date_str = props["日期"]["date"].get("start", "")

            amount = props.get("金額", {}).get("number", 0) or 0

            seller = ""
            if props.get("店家", {}).get("rich_text"):
                seller = props["店家"]["rich_text"][0].get("text", {}).get("content", "")

            invoices.append({
                "id": page["id"],
                "日期": date_str,
                "發票號碼": invoice_number,
                "店家": seller,
                "金額": int(amount),
                "名稱": name,
                "分類": category
            })

        return invoices
    
    def create_transaction(
        self,
        name: str,
        category: str,
        date: str,
        amount: int,
        account: str,
        note: str,
        invoice_number: str = "",
        seller_name: str = ""
    ) -> str:
        """建立交易記錄"""
        # 取得帳戶 ID
        account_id = self.get_account_id(account)
        
        properties = {
            "名稱": {
                "title": [{"text": {"content": name}}]
            },
            "分類": {
                "select": {"name": category}
            },
            "日期": {
                "date": {"start": date}
            },
            "金額": {
                "number": amount
            },
            "帳戶": {
                "relation": [{"id": account_id}]
            },
            "備註": {
                "rich_text": [{"text": {"content": note}}]
            }
        }
        
        # 如果有店家欄位
        if seller_name:
            properties["店家"] = {
                "rich_text": [{"text": {"content": seller_name}}]
            }
        
        # 如果有發票號碼欄位
        if invoice_number:
            properties["發票號碼"] = {
                "rich_text": [{"text": {"content": invoice_number}}]
            }
        
        return self._create_page(self.transactions_db_id, properties)


if __name__ == "__main__":
    # 測試連線
    service = NotionService()
    
    # 測試取得帳戶
    try:
        account_id = service.get_account_id("Unicard")
    except Exception:
        pass
