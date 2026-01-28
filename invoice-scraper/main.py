"""
電子發票爬蟲 FastAPI 服務
提供 API 介面取得電子發票並儲存到 Notion
"""

from datetime import datetime
from typing import Optional, List
import time
import os
import json
import asyncio
import queue
import threading

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
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

# Global lock for login process
login_lock = threading.Lock()
last_login_attempt = 0



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


def perform_background_login():
    """背景執行登入任務"""
    global last_login_attempt
    
    # 再次檢查鎖，雖然 BackgroundTasks 是依序執行，但為了保險
    if not login_lock.acquire(blocking=False):
        logger.info("背景登入任務跳過：已有其他登入正在進行")
        return

    try:
        current_time = time.time()
        # 防止短時間內頻繁重試 (例如 30 秒內不重試)
        if current_time - last_login_attempt < 30:
            logger.info("背景登入任務跳過：距離上次嘗試時間過短")
            return

        last_login_attempt = current_time
        logger.info("開始執行背景登入流程...")
        
        scraper = get_scraper()
        try:
            if scraper.login():
                logger.info("背景登入成功，Session 已更新")
            else:
                logger.error("背景登入失敗")
        except Exception as e:
            logger.error(f"背景登入發生錯誤: {e}")
        finally:
            scraper.close()
            
    finally:
        login_lock.release()


@app.get("/ensure-session")
async def ensure_session(background_tasks: BackgroundTasks):
    """
    確保 session 有效，無效則觸發背景自動登入
    
    為了防止 cron-job.org 超時 (30s)，此 API 會立即回應：
    - Session 有效 -> 200 OK
    - Session 無效 -> 202 Accepted (並在背景開始登入)
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
        
        # Session 無效，需要重新登入
        # 檢查是否已有登入正在進行
        if login_lock.locked():
            return {
                "status": "pending",
                "message": "登入程序已在背景執行中",
                "timestamp": datetime.now().isoformat()
            }
            
        # 觸發背景登入
        background_tasks.add_task(perform_background_login)
        
        # 立即回應，不等待登入完成
        return {
            "status": "accepted",
            "message": "Session 已過期，已觸發背景登入排程",
            "timestamp": datetime.now().isoformat()
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Session 檢查失敗: {str(e)}")
    
    finally:
        # 這裡不需要 close，因為 scraper 只是用來檢查 session，沒有啟動瀏覽器
        # 如果 _try_cached_session 啟動了什麼資源，應該在那裡處理
        # 目前 scraper 在沒 login 前幾乎沒有資源占用
        pass


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
    - 帳戶使用 Notion 中標記為載具帳戶的帳戶
    """
    scraper = get_scraper()
    notion = NotionService()

    # 取得載具帳戶
    carrier_account = notion.get_carrier_account()
    logger.info(f"使用載具帳戶: {carrier_account}")

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
                account=carrier_account,
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
                帳戶=carrier_account,
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


@app.get("/scrape-and-save-stream")
async def scrape_and_save_stream():
    """
    執行爬蟲取得當月發票並儲存到 Notion（SSE 串流版本）
    
    使用 Server-Sent Events 即時回傳進度：
    - event: progress - 進度更新
    - event: result - 最終結果
    - event: error - 錯誤訊息
    
    前端使用方式：
    ```javascript
    const eventSource = new EventSource('/scrape-and-save-stream');
    eventSource.addEventListener('progress', (e) => {
        const data = JSON.parse(e.data);
        console.log(data.message, data.current, data.total);
    });
    eventSource.addEventListener('result', (e) => {
        const data = JSON.parse(e.data);
        console.log('完成:', data);
        eventSource.close();
    });
    ```
    """
    
    async def generate():
        scraper = get_scraper()
        notion = NotionService()

        # 取得載具帳戶
        carrier_account = notion.get_carrier_account()
        logger.info(f"使用載具帳戶: {carrier_account}")

        saved_count = 0
        skipped_count = 0
        scraped_count = 0
        saved_invoices = []
        progress_queue = queue.Queue()
        
        def send_event(event_type: str, data: dict):
            """格式化 SSE 事件"""
            return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
        
        def progress_callback(current, total, stage, message):
            """進度回調 - 放入 queue 供 async generator 使用"""
            progress_queue.put({
                'current': current,
                'total': total,
                'stage': stage,
                'message': message
            })
        
        try:
            # 發送開始事件
            yield send_event('progress', {
                'current': 0,
                'total': 0,
                'stage': 'login',
                'message': '正在登入財政部電子發票平台...'
            })
            
            # 登入（在背景執行緒中執行）
            login_success = False
            login_error = None
            
            def do_login():
                nonlocal login_success, login_error
                try:
                    login_success = scraper.login()
                except Exception as e:
                    login_error = str(e)
            
            login_thread = threading.Thread(target=do_login)
            login_thread.start()
            
            while login_thread.is_alive():
                await asyncio.sleep(0.5)
            
            if login_error:
                yield send_event('error', {'message': f'登入失敗: {login_error}'})
                return
            
            if not login_success:
                yield send_event('error', {'message': '登入失敗，請檢查帳號密碼'})
                return
            
            yield send_event('progress', {
                'current': 0,
                'total': 0,
                'stage': 'fetching',
                'message': '登入成功，正在取得發票列表...'
            })
            
            # 取得發票（在背景執行緒中執行）
            invoices = []
            fetch_error = None
            
            def do_fetch():
                nonlocal invoices, fetch_error
                try:
                    invoices = scraper.get_invoices(progress_callback=progress_callback)  # noqa: F841
                except Exception as e:
                    fetch_error = str(e)
                    logger.error(f"取得發票失敗: {fetch_error}")
            
            fetch_thread = threading.Thread(target=do_fetch)
            fetch_thread.start()
            
            # 持續發送進度更新
            while fetch_thread.is_alive() or not progress_queue.empty():
                try:
                    progress = progress_queue.get_nowait()
                    yield send_event('progress', progress)
                except queue.Empty:
                    await asyncio.sleep(0.1)
            
            if fetch_error:
                yield send_event('error', {'message': f'取得發票失敗: {fetch_error}'})
                return
            
            scraped_count = len(invoices)
            
            yield send_event('progress', {
                'current': 0,
                'total': scraped_count,
                'stage': 'saving',
                'message': f'取得 {scraped_count} 筆發票，開始儲存到 Notion...'
            })
            
            # 儲存到 Notion
            for idx, invoice in enumerate(invoices, 1):
                # 檢查是否已存在
                if notion.invoice_exists(invoice.invoice_number):
                    skipped_count += 1
                    yield send_event('progress', {
                        'current': idx,
                        'total': scraped_count,
                        'stage': 'saving',
                        'message': f'跳過重複發票 {idx}/{scraped_count}: {invoice.invoice_number}'
                    })
                    continue
                
                # 從發票日期提取時間
                transaction_time = None
                if invoice.invoice_date and 'T' in invoice.invoice_date:
                    try:
                        time_part = invoice.invoice_date.split('T')[1][:5]
                        transaction_time = time_part
                    except:
                        pass
                
                yield send_event('progress', {
                    'current': idx,
                    'total': scraped_count,
                    'stage': 'classifying',
                    'message': f'分類發票 {idx}/{scraped_count}: {invoice.seller_name}'
                })
                
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
                    amount=-abs(invoice.amount),
                    account=carrier_account,
                    note=note,
                    invoice_number=invoice.invoice_number,
                    seller_name=invoice.seller_name
                )

                saved_count += 1
                saved_invoices.append({
                    '日期': invoice.invoice_date,
                    '發票號碼': invoice.invoice_number,
                    '店家': invoice.seller_name,
                    '金額': -abs(invoice.amount),
                    '明細': invoice.details,
                    '名稱': classification["name"],
                    '分類': classification["category"],
                    '帳戶': carrier_account,
                    '備註': note
                })
                
                yield send_event('progress', {
                    'current': idx,
                    'total': scraped_count,
                    'stage': 'saving',
                    'message': f'已儲存 {idx}/{scraped_count}: {classification["name"]}'
                })
            
            # 發送最終結果
            yield send_event('result', {
                'success': True,
                'message': f'儲存 {saved_count} 筆，跳過 {skipped_count} 筆重複（共爬取 {scraped_count} 筆）',
                'saved_count': saved_count,
                'skipped_count': skipped_count,
                'scraped_count': scraped_count,
                'saved_invoices': saved_invoices
            })
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"爬取發票時發生錯誤: {error_msg}")
            yield send_event('error', {
                'message': error_msg,
                'saved_count': saved_count,
                'skipped_count': skipped_count,
                'scraped_count': scraped_count
            })
        
        finally:
            scraper.close()
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # 禁用 nginx 緩衝
        }
    )


# ============ 直接執行 ============

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
