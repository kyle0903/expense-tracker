"""
財政部電子發票平台爬蟲
使用 Selenium 模擬瀏覽器登入 + OpenAI 驗證碼辨識
"""

import os
import re
import time
import base64
import logging
from datetime import datetime
from dataclasses import dataclass
from typing import Optional, List

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from openai import OpenAI
from dotenv import load_dotenv

# 載入環境變數 (包含 OPENAI_API_KEY)
load_dotenv()

# 設定 logging
logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)


@dataclass
class Invoice:
    """發票資料結構"""
    invoice_number: str      # 發票號碼
    invoice_date: str        # 發票日期 (來自 getCarrierInvoiceData API)
    seller_name: str         # 賣方名稱
    amount: int              # 金額
    details: Optional[str]   # 消費明細


class EInvoiceScraper:
    """財政部電子發票平台爬蟲"""

    BASE_URL = "https://www.einvoice.nat.gov.tw"
    MOBILE_CARRIER_URL = "https://www.einvoice.nat.gov.tw/portal/btc/mobile"  # 手機條碼發票查詢

    # 類別變數：Session 緩存（在同一個服務實例中共享）
    _session_cache = {
        'cookies': None,
        'auth_token': None,
        'cached_at': None
    }
    SESSION_TTL = 1800  # Session 有效期 30 分鐘

    def __init__(self, phone: str, password: str, headless: bool = True):
        """
        初始化爬蟲

        Args:
            phone: 手機號碼
            password: 密碼
            headless: 是否使用無頭模式
        """
        self.phone = phone
        self.password = password
        self.headless = headless
        self.driver = None
        self.cookies = {}           # 登入後的 cookies
        self.auth_token = None      # Authorization token

    def _is_session_valid(self) -> bool:
        """檢查緩存的 session 是否仍有效"""
        cache = EInvoiceScraper._session_cache
        if not cache['cookies'] or not cache['cached_at']:
            return False

        # 檢查是否過期
        elapsed = time.time() - cache['cached_at']
        if elapsed > self.SESSION_TTL:
            return False

        return True

    def _try_cached_session(self) -> bool:
        """嘗試使用緩存的 session"""
        import requests
        from datetime import timezone
        from zoneinfo import ZoneInfo

        if not self._is_session_valid():
            return False

        cache = EInvoiceScraper._session_cache

        # 用發票查詢 API 測試 session 是否有效
        test_url = "https://service-mc.einvoice.nat.gov.tw/btc/cloud/api/btc502w/getSearchCarrierInvoiceListJWT"
        headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Origin': 'https://www.einvoice.nat.gov.tw',
            'Referer': 'https://www.einvoice.nat.gov.tw/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

        if cache['auth_token']:
            headers['Authorization'] = f'Bearer {cache["auth_token"]}'

        # 只查詢今天的資料來測試
        taipei_tz = ZoneInfo('Asia/Taipei')
        now = datetime.now(taipei_tz)
        now_utc = now.astimezone(timezone.utc)

        payload = {
            "cardCode": "",
            "carrierId2": "",
            "invoiceStatus": "all",
            "isSearchAll": "true",
            "searchStartDate": now_utc.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
            "searchEndDate": now_utc.strftime('%Y-%m-%dT%H:%M:%S.000Z')
        }

        try:
            response = requests.post(test_url, json=payload, headers=headers, cookies=cache['cookies'], timeout=5)
            if response.status_code == 200:
                # Session 有效，使用緩存
                self.cookies = cache['cookies']
                self.auth_token = cache['auth_token']
                return True
            else:
                return False
        except Exception as e:
            logger.warning(f"Session 驗證失敗: {e}")
            return False

    def _cache_session(self):
        """緩存當前的 session"""
        EInvoiceScraper._session_cache = {
            'cookies': self.cookies.copy(),
            'auth_token': self.auth_token,
            'cached_at': time.time()
        }
        logger.info("Session 已緩存")

    @classmethod
    def clear_session_cache(cls):
        """清除 session 快取，強制下次重新登入"""
        cls._session_cache = {
            'cookies': None,
            'auth_token': None,
            'cached_at': None
        }
        logger.info("Session 快取已清除")

    def _init_driver(self):
        """初始化 Chrome/Chromium WebDriver"""
        options = Options()

        if self.headless:
            options.add_argument('--headless=new')

        # 頁面載入策略：eager = DOM 準備好就繼續，不等待所有資源
        options.page_load_strategy = 'eager'

        # 基本設定
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        options.add_argument('--window-size=1280,720')  # 縮小視窗大小
        options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

        # 效能優化：禁用不必要的功能
        options.add_argument('--disable-extensions')
        options.add_argument('--disable-infobars')
        options.add_argument('--disable-notifications')
        options.add_argument('--disable-popup-blocking')
        options.add_argument('--disable-default-apps')
        options.add_argument('--disable-translate')
        options.add_argument('--disable-sync')
        options.add_argument('--disable-background-networking')
        options.add_argument('--disable-logging')
        options.add_argument('--log-level=3')  # 只顯示嚴重錯誤

        # 注意：不能禁用圖片，因為需要載入驗證碼
        prefs = {
            'profile.managed_default_content_settings.fonts': 2,  # 禁用字體下載
            'disk-cache-size': 4096,  # 限制 cache 大小
        }
        options.add_experimental_option('prefs', prefs)

        # 避免被偵測為自動化工具
        options.add_experimental_option('excludeSwitches', ['enable-automation', 'enable-logging'])
        options.add_experimental_option('useAutomationExtension', False)

        # Docker 環境使用 Chromium
        chrome_bin = os.environ.get('CHROME_BIN')
        if chrome_bin:
            options.binary_location = chrome_bin
        
        # 建立 WebDriver
        chromedriver_path = os.environ.get('CHROMEDRIVER_PATH')
        if chromedriver_path:
            service = Service(executable_path=chromedriver_path)
            self.driver = webdriver.Chrome(service=service, options=options)
        else:
            self.driver = webdriver.Chrome(options=options)

        # 執行 CDP 指令來隱藏 webdriver 特徵
        self.driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
            'source': '''
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                })
            '''
        })



    def _recognize_captcha(self, captcha_element) -> str:
        """
        辨識驗證碼 (使用 OpenAI gpt-4o-mini)

        Args:
            captcha_element: 驗證碼圖片元素

        Returns:
            辨識出的驗證碼文字
        """
        # 截取驗證碼圖片
        captcha_png = captcha_element.screenshot_as_png
        
        # 轉換為 base64
        base64_image = base64.b64encode(captcha_png).decode('utf-8')
        
        try:
            # 使用 OpenAI API 辨識
            client = OpenAI()  # 會從環境變數 OPENAI_API_KEY 讀取
            
            response = client.chat.completions.create(
                model="gpt-4.1-mini",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "請辨識這張驗證碼圖片中的5位數字，只回覆數字本身，不要有任何其他文字或說明。"
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{base64_image}"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=10
            )
            
            result = response.choices[0].message.content.strip()
            # 只保留數字
            result = re.sub(r'[^0-9]', '', result)
            
            return result
            
        except Exception:
            return ""

    def _click_login_button(self):
        """點擊登入按鈕進入登入頁面"""
        wait = WebDriverWait(self.driver, 10)

        try:
            # 尋找登入按鈕 (可能有多種選擇器)
            login_selectors = [
                "//a[contains(text(), '登入')]",
                "//button[contains(text(), '登入')]",
                "//a[contains(@href, 'login')]",
                ".login-btn",
                "#loginBtn"
            ]

            for selector in login_selectors:
                try:
                    if selector.startswith('//'):
                        element = wait.until(EC.element_to_be_clickable((By.XPATH, selector)))
                    elif selector.startswith('.'):
                        element = wait.until(EC.element_to_be_clickable((By.CLASS_NAME, selector[1:])))
                    elif selector.startswith('#'):
                        element = wait.until(EC.element_to_be_clickable((By.ID, selector[1:])))
                    else:
                        continue

                    element.click()
                    time.sleep(1)
                    return True
                except:
                    continue

            return False

        except Exception:
            return False

    def login(self, max_retries: int = 3) -> bool:
        """
        登入財政部電子發票平台

        Args:
            max_retries: 驗證碼辨識失敗時的最大重試次數

        Returns:
            是否登入成功
        """
        logger.info("開始登入流程...")

        # 先嘗試使用緩存的 session
        if self._try_cached_session():
            logger.info("使用緩存的 session 成功")
            return True
        
        logger.info("緩存無效，需要重新登入")

        # 初始化瀏覽器
        self._init_driver()

        # 前往「手機條碼發票查詢」頁面，會自動導向登入
        self.driver.get(self.MOBILE_CARRIER_URL)

        wait = WebDriverWait(self.driver, 10)  # 減少等待時間
        short_wait = WebDriverWait(self.driver, 5)

        for attempt in range(max_retries):
            try:
                # 等待登入表單載入
                phone_input = wait.until(EC.presence_of_element_located((By.ID, "mobile_phone")))
                password_input = self.driver.find_element(By.ID, "password")
                captcha_input = self.driver.find_element(By.ID, "captcha")
                captcha_img = wait.until(EC.presence_of_element_located((By.XPATH, "//img[@alt='圖形驗證碼']")))
                refresh_captcha_btn = self.driver.find_element(By.XPATH, "//button[@aria-label='更新圖形驗證碼']")

                # 輸入帳密（不需要額外 sleep）
                phone_input.clear()
                phone_input.send_keys(self.phone)
                password_input.clear()
                password_input.send_keys(self.password)

                # 辨識驗證碼
                captcha_text = self._recognize_captcha(captcha_img)

                if len(captcha_text) != 5:
                    refresh_captcha_btn.click()
                    time.sleep(0.8)  # 等待驗證碼圖片更新
                    continue

                captcha_input.clear()
                captcha_input.send_keys(captcha_text)

                # 點擊登入
                submit_btn = self.driver.find_element(
                    By.XPATH,
                    "//ul[@class='login_list']//button | //button[contains(text(), '登入')] | //form//button[@type='submit']"
                )
                submit_btn.click()

                # 等待頁面回應（保留適當等待時間確保穩定性）
                time.sleep(2)

                # 等待 URL 變化或錯誤訊息出現
                try:
                    short_wait.until(lambda d:
                        'login' not in d.current_url.lower() or
                        d.find_elements(By.XPATH, "//*[contains(text(), '驗證碼錯誤') or contains(text(), '登入失敗')]"))
                except TimeoutException:
                    pass

                current_url = self.driver.current_url

                # 檢查錯誤訊息
                try:
                    self.driver.find_element(
                        By.XPATH,
                        "//*[contains(text(), '驗證碼錯誤') or contains(text(), '登入失敗') or contains(text(), '密碼錯誤')]"
                    )
                    try:
                        refresh_btn = self.driver.find_element(By.XPATH, "//button[@aria-label='更新圖形驗證碼']")
                        refresh_btn.click()
                        time.sleep(0.8)  # 等待驗證碼圖片更新
                    except:
                        pass
                    continue
                except NoSuchElementException:
                    pass

                # 檢查是否登入成功
                if 'login' not in current_url.lower():
                    self._save_session()
                    self._cache_session()  # 緩存 session 供下次使用
                    return True

                try:
                    self.driver.find_element(By.XPATH, "//*[contains(text(), '登出')]")
                    self._save_session()
                    self._cache_session()  # 緩存 session 供下次使用
                    return True
                except:
                    pass

            except TimeoutException:
                self.driver.refresh()
                time.sleep(2)

            except Exception:
                pass


        return False

    def _save_session(self):
        """登入成功後保存 session (cookies + JWT token)"""
        # 取得所有 cookies
        self.cookies = {cookie['name']: cookie['value'] for cookie in self.driver.get_cookies()}

        # 嘗試從 localStorage/sessionStorage 取得 JWT token
        try:
            local_storage = self.driver.execute_script(
                "return Object.entries(localStorage).reduce((acc, [k, v]) => ({...acc, [k]: v}), {});"
            )
            session_storage = self.driver.execute_script(
                "return Object.entries(sessionStorage).reduce((acc, [k, v]) => ({...acc, [k]: v}), {});"
            )

            token_keys = ['token', 'authToken', 'jwt', 'accessToken', 'jwtToken', 'auth_token', 'access_token']
            for _, storage in [('localStorage', local_storage), ('sessionStorage', session_storage)]:
                for key in token_keys:
                    if key in storage:
                        self.auth_token = storage[key]
                        break
                    for k, v in storage.items():
                        if any(tk in k.lower() for tk in ['token', 'jwt', 'auth']):
                            if isinstance(v, str) and len(v) > 50:
                                self.auth_token = v
                                break
                if self.auth_token:
                    break

        except Exception:
            pass

        self.driver.quit()
        self.driver = None

    def get_invoices(self, progress_callback=None) -> List[Invoice]:
        """
        使用 requests 取得發票列表

        Args:
            progress_callback: 可選的進度回調函數，簽名為 (current, total, stage, message)
                - current: 當前處理的發票索引 (1-based)
                - total: 發票總數
                - stage: 階段 ('fetching_list', 'processing', 'done')
                - message: 狀態訊息

        Returns:
            發票列表
        """
        import requests

        if not self.cookies:
            raise Exception("尚未登入，請先呼叫 login()")

        invoices = []

        # 計算日期範圍 (使用台北時區)
        from zoneinfo import ZoneInfo
        taipei_tz = ZoneInfo('Asia/Taipei')
        end_date = datetime.now(taipei_tz)
        start_date = end_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


        api_url = "https://service-mc.einvoice.nat.gov.tw/btc/cloud/api/btc502w/getSearchCarrierInvoiceListJWT"

        headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Origin': 'https://www.einvoice.nat.gov.tw',
            'Referer': 'https://www.einvoice.nat.gov.tw/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

        if self.auth_token:
            headers['Authorization'] = f'Bearer {self.auth_token}'

        # 轉換為 UTC 時間（台北 UTC+8）
        from datetime import timezone
        start_utc = start_date.astimezone(timezone.utc)
        end_utc = end_date.astimezone(timezone.utc)

        payload = {
            "cardCode": "",
            "carrierId2": "",
            "invoiceStatus": "all",
            "isSearchAll": "true",
            "searchStartDate": start_utc.strftime('%Y-%m-%dT%H:%M:%S.') + f"{start_utc.microsecond // 1000:03d}Z",
            "searchEndDate": end_utc.strftime('%Y-%m-%dT%H:%M:%S.') + f"{end_utc.microsecond // 1000:03d}Z"
        }

        try:
            # 步驟1: 取得查詢用的 JWT token
            logger.info(f"查詢發票列表，日期範圍: {start_date.strftime('%Y-%m-%d')} ~ {end_date.strftime('%Y-%m-%d')}")
            response = requests.post(api_url, headers=headers, cookies=self.cookies, json=payload, timeout=30)

            if response.status_code != 200:
                error_msg = f"取得 JWT token 失敗: HTTP {response.status_code}"
                logger.error(error_msg)
                # 清除快取，下次強制重新登入
                self.clear_session_cache()
                raise Exception(error_msg)

            jwt_token = response.text.strip()

            # 步驟2: 查詢發票列表
            search_url = "https://service-mc.einvoice.nat.gov.tw/btc/cloud/api/btc502w/searchCarrierInvoice"
            search_headers = {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {self.auth_token}' if self.auth_token else '',
                'Origin': 'https://www.einvoice.nat.gov.tw',
                'Referer': 'https://www.einvoice.nat.gov.tw/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            search_payload = {"token": jwt_token}

            search_response = requests.post(search_url, headers=search_headers, cookies=self.cookies, json=search_payload, timeout=30)

            if search_response.status_code != 200:
                error_msg = f"查詢發票列表失敗: HTTP {search_response.status_code}"
                logger.error(error_msg)
                # 清除快取，下次強制重新登入
                self.clear_session_cache()
                raise Exception(error_msg)

            data = search_response.json()
            invoice_list = data.get('content', [])

            # 處理分頁 (如果有第2頁以上)
            total_pages = data.get('totalPages', 0)
            if total_pages > 1:
                logger.info(f"發現共有 {total_pages} 頁，開始取得後續頁面...")
                for page in range(1, total_pages):
                    try:
                        # 依據使用者需求：第二頁開始使用 GET 加上 query params: ?page={page}&size=10
                        page_url = f"{search_url}?page={page}&size=10"
                        logger.info(f"取得第 {page+1}/{total_pages} 頁: {page_url}")
                        
                        page_resp = requests.post(page_url, headers=search_headers, cookies=self.cookies, json=search_payload, timeout=30)
                        
                        if page_resp.status_code == 200:
                            page_data = page_resp.json()
                            content = page_data.get('content', [])
                            if content:
                                invoice_list.extend(content)
                                logger.info(f"第 {page+1} 頁取得 {len(content)} 筆資料")
                        else:
                            logger.warning(f"取得第 {page+1} 頁失敗: HTTP {page_resp.status_code}")
                    except Exception as e:
                        logger.error(f"取得第 {page+1} 頁時發生錯誤: {e}")
            total_count = len(invoice_list)
            logger.info(f"API 返回 {total_count} 筆發票")

            # 回報取得列表完成
            if progress_callback:
                progress_callback(0, total_count, 'fetching_list', f'取得 {total_count} 筆發票，開始處理...')

            if isinstance(invoice_list, list) and total_count > 0:
                for idx, item in enumerate(invoice_list, 1):
                    invoice_token = item.get('token', '')
                    invoice_number = item.get('invoiceNumber', '')

                    # 回報處理進度
                    if progress_callback:
                        progress_callback(idx, total_count, 'processing', f'處理發票 {idx}/{total_count}: {invoice_number}')

                    invoice_date = None
                    seller_name = None
                    amount = None
                    details = None

                    if invoice_token:
                        invoice_data = self._get_invoice_data(invoice_token)
                        if invoice_data:
                            raw_date = invoice_data.get('invoiceDate', '')
                            raw_time = invoice_data.get('invoiceTime', '')

                            if raw_date and len(raw_date) == 8:
                                formatted_date = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}"
                                if raw_time:
                                    invoice_date = f"{formatted_date}T{raw_time}+08:00"
                                else:
                                    invoice_date = f"{formatted_date}T00:00:00+08:00"

                            total_amount = invoice_data.get('totalAmount', '')
                            if total_amount:
                                # 移除千位分隔符逗號後再轉換
                                amount = int(str(total_amount).replace(',', ''))

                            seller_name = invoice_data.get('sellerName', '')
                            details = self._get_invoice_details(invoice_token)

                    # Fallback
                    if not invoice_date:
                        invoice_date_raw = item.get('invoiceDate', '')
                        invoice_date = str(invoice_date_raw) if invoice_date_raw else datetime.now().strftime('%Y-%m-%dT%H:%M:%S+08:00')

                    if not seller_name:
                        seller_name = item.get('sellerName', '未知商店')

                    if amount is None:
                        # 移除千位分隔符逗號後再轉換
                        raw_amount = str(item.get('totalAmount', 0)).replace(',', '')
                        amount = int(raw_amount) if raw_amount else 0

                    invoice = Invoice(
                        invoice_number=invoice_number,
                        invoice_date=invoice_date,
                        seller_name=seller_name,
                        amount=amount,
                        details=details
                    )
                    invoices.append(invoice)

            logger.info(f"成功處理 {len(invoices)} 筆發票")

            # 回報處理完成
            if progress_callback:
                progress_callback(total_count, total_count, 'done', f'完成！共處理 {len(invoices)} 筆發票')

        except Exception as e:
            logger.error(f"取得發票列表時發生錯誤: {e}")
            # 重新拋出異常，讓上層處理
            raise

        return invoices
    
    def _get_invoice_data(self, token: str) -> Optional[dict]:
        """
        透過 token 呼叫 getCarrierInvoiceData API 取得發票資料（包含正確的日期）
        
        Args:
            token: 發票的 JWT token
            
        Returns:
            包含 invoiceDate 等資訊的 dict，或 None
        """
        import requests
        
        api_url = "https://service-mc.einvoice.nat.gov.tw/btc/cloud/api/common/getCarrierInvoiceData"
        
        headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.auth_token}' if self.auth_token else '',
            'Origin': 'https://www.einvoice.nat.gov.tw',
            'Referer': 'https://www.einvoice.nat.gov.tw/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        try:
            # Payload 是發票的 JWT token 字串 (帶雙引號)
            response = requests.post(
                api_url,
                headers=headers,
                cookies=self.cookies,
                data=f'"{token}"',
                timeout=10
            )
            
            if response.status_code == 200 and response.text:
                data = response.json()
                # 回傳整個資料物件
                return data
                    
        except Exception:
            pass
        
        return None
    
    def _get_invoice_details(self, token: str) -> Optional[str]:
        """透過 token 取得發票消費明細"""
        import requests
        
        detail_url = "https://service-mc.einvoice.nat.gov.tw/btc/cloud/api/common/getCarrierInvoiceDetail"
        
        headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.auth_token}' if self.auth_token else '',
            'Origin': 'https://www.einvoice.nat.gov.tw',
            'Referer': 'https://www.einvoice.nat.gov.tw/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        try:
            # Payload 是發票的 JWT token 字串 (不是 JSON 物件)
            response = requests.post(
                detail_url,
                headers=headers,
                cookies=self.cookies,
                data=f'"{token}"',  # 直接發送 JWT token 字串 (帶雙引號)
                timeout=10
            )
            
            if response.status_code == 200 and response.text:
                data = response.json()
                content = data.get('content', [])
                if content:
                    # 組合明細資訊: "品名 x數量 $金額; ..."
                    details_list = []
                    for item in content:
                        item_name = item.get('item', '')
                        quantity = item.get('quantity', '1')
                        amount = item.get('amount', '')
                        details_list.append(f"{item_name} x{quantity} ${amount}")
                    
                    return "\n".join(details_list)
                    
        except Exception:
            pass
        
        return None

    def close(self):
        """關閉瀏覽器"""
        if self.driver:
            self.driver.quit()
