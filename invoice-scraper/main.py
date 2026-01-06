"""
電子發票爬蟲 FastAPI 服務
提供 API 介面取得電子發票並儲存到 Notion
"""

import os
import json
from datetime import datetime
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# 載入爬蟲和 Notion 服務
from einvoice_scraper import EInvoiceScraper, Invoice
from notion_service import NotionService
from category_classifier import classify_invoice


# ============ Pydantic Models ============

class InvoiceResponse(BaseModel):
    日期: str
    發票號碼: str
    店家: str
    金額: int
    明細: Optional[str] = None


class SavedInvoiceResponse(BaseModel):
    """儲存後的發票回應，包含分類資訊"""
    日期: str
    發票號碼: str
    店家: str
    金額: int
    明細: Optional[str] = None
    # 分類後的資訊
    名稱: str
    分類: str
    帳戶: str
    備註: str


class ScrapeResponse(BaseModel):
    success: bool
    message: str
    invoices: List[InvoiceResponse]


class SaveResponse(BaseModel):
    success: bool
    message: str
    saved_count: int
    skipped_count: int
    saved_invoices: List[SavedInvoiceResponse]


class NotionInvoiceResponse(BaseModel):
    """Notion 中的發票記錄"""
    id: str
    日期: str
    發票號碼: str
    店家: Optional[str] = None
    金額: int
    名稱: str
    分類: str


class NotionInvoicesListResponse(BaseModel):
    success: bool
    message: str
    invoices: List[NotionInvoiceResponse]
    total: int


# ============ FastAPI App ============

@asynccontextmanager
async def lifespan(app: FastAPI):
    """應用程式生命週期管理"""
    print("🚀 電子發票爬蟲 API 啟動")
    yield
    print("👋 電子發票爬蟲 API 關閉")


app = FastAPI(
    title="電子發票爬蟲 API",
    description="從財政部電子發票平台爬取發票並儲存到 Notion",
    version="1.0.0",
    lifespan=lifespan
)

# CORS 設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生產環境應限制來源
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ Helper Functions ============

def get_scraper() -> EInvoiceScraper:
    """取得爬蟲實例"""
    phone = os.getenv("EINVOICE_PHONE")
    password = os.getenv("EINVOICE_PASSWORD")
    
    if not phone or not password:
        raise HTTPException(status_code=500, detail="缺少 EINVOICE_PHONE 或 EINVOICE_PASSWORD 環境變數")
    
    return EInvoiceScraper(phone=phone, password=password, headless=True)


def invoice_to_response(invoice: Invoice) -> InvoiceResponse:
    """將 Invoice 轉換為 API Response"""
    return InvoiceResponse(
        日期=invoice.invoice_date,
        發票號碼=invoice.invoice_number,
        店家=invoice.seller_name,
        金額=invoice.amount,
        明細=invoice.details
    )


# ============ API Endpoints ============

@app.get("/health")
async def health_check():
    """健康檢查"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    }


@app.get("/scrape", response_model=ScrapeResponse)
async def scrape_invoices():
    """
    執行爬蟲取得當月發票列表（不儲存）
    
    API 限制只能查詢當月發票
    """
    scraper = get_scraper()
    
    try:
        # 登入
        if not scraper.login():
            raise HTTPException(status_code=401, detail="登入失敗")
        
        # 取得發票（固定查詢當月）
        invoices = scraper.get_invoices(months=1)
        
        return ScrapeResponse(
            success=True,
            message=f"成功取得 {len(invoices)} 筆發票",
            invoices=[invoice_to_response(inv) for inv in invoices]
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    finally:
        scraper.close()


@app.get("/notion-invoices", response_model=NotionInvoicesListResponse)
async def get_notion_invoices(year: int = None, month: int = None):
    """
    取得 Notion 中指定月份有發票號碼的交易記錄

    - year: 年份（預設當年）
    - month: 月份（預設當月）
    """
    try:
        notion = NotionService()
        invoices = notion.get_invoices_for_month(year, month)

        return NotionInvoicesListResponse(
            success=True,
            message=f"取得 {len(invoices)} 筆發票記錄",
            invoices=[NotionInvoiceResponse(**inv) for inv in invoices],
            total=len(invoices)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/scrape-and-save", response_model=SaveResponse)
async def scrape_and_save_invoices():
    """
    執行爬蟲取得當月發票並儲存到 Notion
    
    - 自動使用 OpenAI 分類
    - 帳戶預設為「Unicard」
    """
    scraper = get_scraper()
    notion = NotionService()
    
    saved_count = 0
    skipped_count = 0
    saved_invoices = []
    
    try:
        # 登入
        if not scraper.login():
            raise HTTPException(status_code=401, detail="登入失敗")
        
        # 取得發票（固定查詢當月）
        invoices = scraper.get_invoices(months=1)
        
        for invoice in invoices:
            # 檢查是否已存在（用發票號碼判斷）
            if notion.invoice_exists(invoice.invoice_number):
                skipped_count += 1
                continue
            
            # 使用 OpenAI 分類
            classification = classify_invoice(
                seller_name=invoice.seller_name,
                details=invoice.details or ""
            )
            
            # 準備備註
            note = invoice.details or f"{invoice.invoice_number} - {invoice.seller_name}"
            
            # 儲存到 Notion
            notion.create_transaction(
                name=classification["name"],
                category=classification["category"],
                date=invoice.invoice_date,
                amount=-abs(invoice.amount),  # 支出為負數
                account="Unicard",
                note=note,
                invoice_number=invoice.invoice_number,
                seller_name=invoice.seller_name
            )
            
            saved_count += 1
            # 加入完整分類資訊到回應
            saved_invoices.append(SavedInvoiceResponse(
                日期=invoice.invoice_date,
                發票號碼=invoice.invoice_number,
                店家=invoice.seller_name,
                金額=-abs(invoice.amount),
                明細=invoice.details,
                名稱=classification["name"],
                分類=classification["category"],
                帳戶="Unicard",
                備註=note
            ))
        
        return SaveResponse(
            success=True,
            message=f"儲存 {saved_count} 筆，跳過 {skipped_count} 筆重複",
            saved_count=saved_count,
            skipped_count=skipped_count,
            saved_invoices=saved_invoices
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    finally:
        scraper.close()


# ============ 直接執行 ============

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
