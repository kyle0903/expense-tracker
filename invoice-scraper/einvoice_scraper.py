"""
財政部電子發票平台爬蟲
使用 Selenium 模擬瀏覽器登入 + OpenAI 驗證碼辨識
"""

import os
import re
import time
import base64
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
from PIL import Image
from openai import OpenAI
from dotenv import load_dotenv

# 載入環境變數 (包含 OPENAI_API_KEY)
load_dotenv()


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

    def _init_driver(self):
        """初始化 Chrome/Chromium WebDriver"""
        options = Options()

        if self.headless:
            options.add_argument('--headless=new')

        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        options.add_argument('--window-size=1920,1080')
        options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

        # 避免被偵測為自動化工具
        options.add_experimental_option('excludeSwitches', ['enable-automation'])
        options.add_experimental_option('useAutomationExtension', False)

        # Docker 環境使用 Chromium
        chrome_bin = os.environ.get('CHROME_BIN')
        if chrome_bin:
            options.binary_location = chrome_bin
        
        # 建立 WebDriver
        from selenium.webdriver.chrome.service import Service
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
        login_start = time.time()

        # 初始化瀏覽器
        stage_start = time.time()
        self._init_driver()
        print(f"[LOGIN] 1. 初始化瀏覽器: {time.time() - stage_start:.2f} 秒")

        # 前往「手機條碼發票查詢」頁面，會自動導向登入
        stage_start = time.time()
        self.driver.get(self.MOBILE_CARRIER_URL)
        time.sleep(2)
        print(f"[LOGIN] 2. 載入登入頁面: {time.time() - stage_start:.2f} 秒")

        wait = WebDriverWait(self.driver, 15)

        for attempt in range(max_retries):
            print(f"[LOGIN] 嘗試第 {attempt + 1} 次登入")
            try:
                # 等待登入表單載入
                stage_start = time.time()
                phone_input = wait.until(EC.presence_of_element_located((By.ID, "mobile_phone")))
                password_input = self.driver.find_element(By.ID, "password")
                captcha_input = self.driver.find_element(By.ID, "captcha")
                captcha_img = self.driver.find_element(By.XPATH, "//img[@alt='圖形驗證碼']")
                refresh_captcha_btn = self.driver.find_element(By.XPATH, "//button[@aria-label='更新圖形驗證碼']")
                print(f"[LOGIN] 3. 等待表單載入: {time.time() - stage_start:.2f} 秒")

                # 輸入帳密
                phone_input.clear()
                phone_input.send_keys(self.phone)
                password_input.clear()
                password_input.send_keys(self.password)

                time.sleep(1.5)

                # 辨識驗證碼
                stage_start = time.time()
                captcha_text = self._recognize_captcha(captcha_img)
                print(f"[LOGIN] 4. 辨識驗證碼 (OpenAI): {time.time() - stage_start:.2f} 秒")

                if len(captcha_text) != 5:
                    print(f"[LOGIN] 驗證碼辨識失敗，重新整理")
                    refresh_captcha_btn.click()
                    time.sleep(1.5)
                    continue

                captcha_input.clear()
                captcha_input.send_keys(captcha_text)

                # 點擊登入
                stage_start = time.time()
                submit_btn = self.driver.find_element(
                    By.XPATH,
                    "//ul[@class='login_list']//button | //button[contains(text(), '登入')] | //form//button[@type='submit']"
                )
                submit_btn.click()
                time.sleep(3)
                print(f"[LOGIN] 5. 提交登入: {time.time() - stage_start:.2f} 秒")

                current_url = self.driver.current_url

                # 檢查錯誤訊息
                try:
                    self.driver.find_element(
                        By.XPATH,
                        "//*[contains(text(), '驗證碼錯誤') or contains(text(), '登入失敗') or contains(text(), '密碼錯誤')]"
                    )
                    print("[LOGIN] 登入失敗，重試中...")
                    try:
                        refresh_btn = self.driver.find_element(By.XPATH, "//button[@aria-label='更新圖形驗證碼']")
                        refresh_btn.click()
                        time.sleep(1.5)
                    except:
                        pass
                    continue
                except NoSuchElementException:
                    pass

                # 檢查是否登入成功
                if 'login' not in current_url.lower():
                    stage_start = time.time()
                    self._save_session()
                    print(f"[LOGIN] 6. 保存 Session: {time.time() - stage_start:.2f} 秒")
                    print(f"[LOGIN] 登入成功！總耗時: {time.time() - login_start:.2f} 秒")
                    return True

                try:
                    self.driver.find_element(By.XPATH, "//*[contains(text(), '登出')]")
                    stage_start = time.time()
                    self._save_session()
                    print(f"[LOGIN] 6. 保存 Session: {time.time() - stage_start:.2f} 秒")
                    print(f"[LOGIN] 登入成功！總耗時: {time.time() - login_start:.2f} 秒")
                    return True
                except:
                    pass

            except TimeoutException:
                print("[LOGIN] 頁面載入超時，重新整理")
                self.driver.refresh()
                time.sleep(2)

            except Exception:
                pass

        print(f"[LOGIN] 登入失敗，總耗時: {time.time() - login_start:.2f} 秒")
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
            for storage_name, storage in [('localStorage', local_storage), ('sessionStorage', session_storage)]:
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

    def get_invoices(self) -> List[Invoice]:
        """
        使用 requests 取得發票列表

        Returns:
            發票列表
        """
        import requests

        start_time = time.time()

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
            response = requests.post(api_url, headers=headers, cookies=self.cookies, json=payload, timeout=30)

            if response.status_code != 200:
                return invoices

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
                return invoices

            data = search_response.json()
            invoice_list = data.get('content', [])

            if isinstance(invoice_list, list) and len(invoice_list) > 0:
                for item in invoice_list:
                    invoice_token = item.get('token', '')
                    invoice_number = item.get('invoiceNumber', '')

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
                                amount = int(total_amount)

                            seller_name = invoice_data.get('sellerName', '')
                            details = self._get_invoice_details(invoice_token)

                    # Fallback
                    if not invoice_date:
                        invoice_date_raw = item.get('invoiceDate', '')
                        invoice_date = str(invoice_date_raw) if invoice_date_raw else datetime.now().strftime('%Y-%m-%dT%H:%M:%S+08:00')

                    if not seller_name:
                        seller_name = item.get('sellerName', '未知商店')

                    if amount is None:
                        amount = int(item.get('totalAmount', 0))

                    invoice = Invoice(
                        invoice_number=invoice_number,
                        invoice_date=invoice_date,
                        seller_name=seller_name,
                        amount=amount,
                        details=details
                    )
                    invoices.append(invoice)

        except Exception:
            pass

        print("[GET_INVOICES] 取得發票耗時: {} 秒".format(time.time() - start_time))

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

    def _get_invoice_detail(self, token: str) -> Optional[Invoice]:
        """
        透過 API 取得發票詳細資訊

        Args:
            token: 發票的 JWT token

        Returns:
            Invoice 物件
        """
        import requests

        api_url = "https://service-mc.einvoice.nat.gov.tw/btc/cloud/api/common/getCarrierInvoiceDetail"

        # Token 放在 Authorization header
        headers = {
            'Accept': 'application/json, text/plain, */*',
            'Authorization': f'Bearer {token}',
            'Origin': 'https://www.einvoice.nat.gov.tw',
            'Referer': 'https://www.einvoice.nat.gov.tw/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

        try:
            # POST 不需要 payload
            response = requests.post(
                api_url,
                headers=headers,
                cookies=self.cookies,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()

                # 解析 API 回應
                if data.get('code') == '200' or data.get('success'):
                    detail = data.get('data', data)

                    # 取得發票資訊
                    invoice_number = detail.get('invNum', detail.get('invoiceNumber', ''))
                    invoice_date_raw = detail.get('invDate', detail.get('invoiceDate', ''))
                    seller_name = detail.get('sellerName', detail.get('shopName', '未知商店'))
                    amount = int(detail.get('amount', detail.get('totalAmount', 0)))

                    # 取得消費明細
                    details_list = detail.get('details', detail.get('items', []))
                    details_str = None
                    if details_list:
                        details_str = '; '.join([
                            f"{item.get('description', item.get('name', ''))}: ${item.get('amount', item.get('price', ''))}"
                            for item in details_list
                        ])

                    # 轉換日期格式
                    if invoice_date_raw:
                        # 可能是 timestamp 或日期字串
                        if isinstance(invoice_date_raw, (int, float)) or invoice_date_raw.isdigit():
                            ts = int(invoice_date_raw) / 1000 if int(invoice_date_raw) > 9999999999 else int(invoice_date_raw)
                            invoice_date = datetime.fromtimestamp(ts).strftime('%Y-%m-%d')
                        else:
                            # 嘗試解析日期字串
                            invoice_date = invoice_date_raw[:10]
                    else:
                        invoice_date = datetime.now().strftime('%Y-%m-%d')

                    return Invoice(
                        invoice_number=invoice_number,
                        invoice_date=invoice_date,
                        seller_name=seller_name,
                        amount=amount,
                        details=details_str
                    )
        except Exception:
            pass

        return None


    def close(self):
        """關閉瀏覽器"""
        if self.driver:
            self.driver.quit()
