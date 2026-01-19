"""
電子發票爬蟲 FastAPI 服務
提供 API 介面取得電子發票並儲存到 Notion
"""

from datetime import datetime
from typing import Optional, List
import time
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

import logging

# 設定 logging
logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

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
    scraped_count: int = 0  # 爬取到的發票數量
    saved_invoices: List[SavedInvoiceResponse]
    error_detail: Optional[str] = None  # 錯誤詳細資訊


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

app = FastAPI(
    title="電子發票爬蟲 API",
    description="從財政部電子發票平台爬取發票並儲存到 Notion",
    version="1.0.0"
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


@app.post("/clear-session")
async def clear_session():
    """
    清除 session 快取，強制下次重新登入
    
    當報告「儲存0筆跳過0筆重複」時，可以先呼叫此 API 清除快取
    """
    EInvoiceScraper.clear_session_cache()
    logger.info("已清除 session 快取")
    return {
        "success": True,
        "message": "Session 快取已清除，下次將重新登入",
        "timestamp": datetime.now().isoformat()
    }


@app.get("/ensure-session")
async def ensure_session():
    """
    確保 session 有效，無效則自動登入
    
    用於 keep-alive 時順便維持登入狀態，
    減少後續 API 呼叫時的登入時間
    """
    scraper = get_scraper()
    
    try:
        # 先檢查緩存的 session 是否有效
        if scraper._try_cached_session():
            return {
                "status": "cached",
                "message": "Session 仍然有效",
                "timestamp": datetime.now().isoformat()
            }
        
        # 需要重新登入
        start_time = time.time()
        if scraper.login():
            elapsed = time.time() - start_time
            return {
                "status": "refreshed",
                "message": f"已重新登入並緩存 session（耗時 {elapsed:.2f} 秒）",
                "timestamp": datetime.now().isoformat()
            }
        else:
            raise HTTPException(status_code=401, detail="登入失敗")
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Session 檢查失敗: {str(e)}")
    
    finally:
        scraper.close()


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
        invoices = scraper.get_invoices()

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
    scraped_count = 0
    saved_invoices = []
    
    try:
        # 登入
        logger.info("開始登入財政部電子發票平台...")
        if not scraper.login():
            raise HTTPException(status_code=401, detail="登入失敗，請檢查帳號密碼")

        # 取得發票（固定查詢當月）
        logger.info("正在取得當月發票列表...")
        invoices = scraper.get_invoices()
        scraped_count = len(invoices)
        logger.info(f"成功取得 {scraped_count} 筆發票")

        for invoice in invoices:
            # 檢查是否已存在（用發票號碼判斷）
            if notion.invoice_exists(invoice.invoice_number):
                skipped_count += 1
                continue
            
            # 從發票日期提取時間 (HH:MM)
            transaction_time = None
            if invoice.invoice_date and 'T' in invoice.invoice_date:
                try:
                    time_part = invoice.invoice_date.split('T')[1][:5]  # 取 HH:MM
                    transaction_time = time_part
                except:
                    pass
            
            # 使用 OpenAI 分類
            classification = classify_invoice(
                seller_name=invoice.seller_name,
                details=invoice.details or "",
                transaction_time=transaction_time
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
            message=f"儲存 {saved_count} 筆，跳過 {skipped_count} 筆重複（共爬取 {scraped_count} 筆）",
            saved_count=saved_count,
            skipped_count=skipped_count,
            scraped_count=scraped_count,
            saved_invoices=saved_invoices
        )
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        logger.error(f"爬取發票時發生錯誤: {error_msg}")
        
        # 如果有部分成功，仍然返回結果
        if scraped_count > 0 or saved_count > 0:
            return SaveResponse(
                success=False,
                message=f"部分失敗：儲存 {saved_count} 筆，跳過 {skipped_count} 筆（共爬取 {scraped_count} 筆）",
                saved_count=saved_count,
                skipped_count=skipped_count,
                scraped_count=scraped_count,
                saved_invoices=saved_invoices,
                error_detail=error_msg
            )
        
        # 完全失敗
        raise HTTPException(
            status_code=500, 
            detail=f"取得發票失敗: {error_msg}。請嘗試呼叫 /clear-session 後重試。"
        )
    
    finally:
        scraper.close()


# ============ 直接執行 ============

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
