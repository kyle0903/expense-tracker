"""
財政部電子發票平台爬蟲
使用 Selenium 模擬瀏覽器登入 + OpenAI 驗證碼辨識
"""

import os
import re
import time
import json
import sys
import base64
from io import BytesIO
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from typing import Optional, List
from pathlib import Path

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
    invoice_date: str        # 發票日期 (YYYY-MM-DD)
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

        print("Chrome WebDriver 初始化成功")

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
            
            print(f"驗證碼辨識結果: {result}")
            return result
            
        except Exception as e:
            print(f"OpenAI 辨識失敗: {e}")
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
                    print("已點擊登入按鈕")
                    time.sleep(2)
                    return True
                except:
                    continue

            print("找不到登入按鈕，可能已在登入頁面")
            return False

        except Exception as e:
            print(f"點擊登入按鈕失敗: {e}")
            return False

    def login(self, max_retries: int = 3) -> bool:
        """
        登入財政部電子發票平台

        Args:
            max_retries: 驗證碼辨識失敗時的最大重試次數

        Returns:
            是否登入成功
        """
        self._init_driver()

        # 前往「手機條碼發票查詢」頁面，會自動導向登入
        print(f"正在前往手機條碼發票查詢頁面...")
        self.driver.get(self.MOBILE_CARRIER_URL)
        time.sleep(3)

        # 等待頁面載入，可能會跳轉到登入頁面
        print(f"當前網址: {self.driver.current_url}")

        wait = WebDriverWait(self.driver, 15)

        for attempt in range(max_retries):
            try:
                print(f"\n登入嘗試 {attempt + 1}/{max_retries}")

                # 等待登入表單載入
                # 尋找手機號碼輸入框 (id="mobile_phone")
                phone_input = wait.until(EC.presence_of_element_located((
                    By.ID, "mobile_phone"
                )))

                # 尋找密碼輸入框 (id="password")
                password_input = self.driver.find_element(By.ID, "password")

                # 尋找驗證碼輸入框 (id="captcha")
                captcha_input = self.driver.find_element(By.ID, "captcha")

                # 尋找驗證碼圖片 (alt="圖形驗證碼")
                captcha_img = self.driver.find_element(
                    By.XPATH,
                    "//img[@alt='圖形驗證碼']"
                )

                # 尋找更新驗證碼按鈕
                refresh_captcha_btn = self.driver.find_element(
                    By.XPATH,
                    "//button[@aria-label='更新圖形驗證碼']"
                )

                # 清空並輸入手機號碼
                phone_input.clear()
                phone_input.send_keys(self.phone)
                print(f"已輸入手機號碼: {self.phone[:4]}****{self.phone[-2:]}")

                # 清空並輸入密碼
                password_input.clear()
                password_input.send_keys(self.password)
                print("已輸入密碼")

                # 等待驗證碼圖片載入
                time.sleep(1)

                # 辨識驗證碼
                captcha_text = self._recognize_captcha(captcha_img)

                if len(captcha_text) != 5:
                    print(f"驗證碼長度不正確 ({len(captcha_text)}), 刷新重試...")
                    # 點擊更新驗證碼按鈕
                    refresh_captcha_btn.click()
                    time.sleep(1)
                    continue

                # 輸入驗證碼
                captcha_input.clear()
                captcha_input.send_keys(captcha_text)
                print(f"已輸入驗證碼: {captcha_text}")

                # 尋找並點擊登入按鈕 (在 ul.login_list 裡面)
                submit_btn = self.driver.find_element(
                    By.XPATH,
                    "//ul[@class='login_list']//button | //button[contains(text(), '登入')] | //form//button[@type='submit']"
                )
                submit_btn.click()
                print("已點擊登入按鈕")

                # 等待登入結果
                time.sleep(3)

                # 檢查是否登入成功 (查看是否有錯誤訊息或已跳轉)
                current_url = self.driver.current_url

                # 檢查是否有錯誤訊息
                try:
                    error_msg = self.driver.find_element(
                        By.XPATH,
                        "//*[contains(text(), '驗證碼錯誤') or contains(text(), '登入失敗') or contains(text(), '密碼錯誤')]"
                    )
                    print(f"登入失敗: {error_msg.text}")

                    # 刷新驗證碼重試
                    try:
                        refresh_btn = self.driver.find_element(
                            By.XPATH,
                            "//button[@aria-label='更新圖形驗證碼']"
                        )
                        refresh_btn.click()
                        time.sleep(1)
                    except:
                        pass
                    continue

                except NoSuchElementException:
                    # 沒有錯誤訊息，可能登入成功
                    pass

                # 檢查是否已離開登入頁面
                if 'login' not in current_url.lower():
                    print("登入成功！")
                    self._save_session()
                    return True

                # 額外檢查：尋找登出按鈕
                try:
                    self.driver.find_element(By.XPATH, "//*[contains(text(), '登出')]")
                    print("登入成功！")
                    self._save_session()
                    return True
                except:
                    pass

            except TimeoutException:
                print("頁面載入超時，重試中...")
                self.driver.refresh()
                time.sleep(2)

            except Exception as e:
                print(f"登入過程發生錯誤: {e}")

        print("登入失敗，已達最大重試次數")
        return False

    def _save_session(self):
        """登入成功後保存 session (cookies + JWT token)"""
        # 取得所有 cookies
        self.cookies = {cookie['name']: cookie['value'] for cookie in self.driver.get_cookies()}
        print(f"已取得 {len(self.cookies)} 個 cookies")

        # 嘗試從 localStorage/sessionStorage 取得 JWT token
        try:
            # 取得 localStorage
            local_storage = self.driver.execute_script(
                "return Object.entries(localStorage).reduce((acc, [k, v]) => ({...acc, [k]: v}), {});"
            )
            # 取得 sessionStorage
            session_storage = self.driver.execute_script(
                "return Object.entries(sessionStorage).reduce((acc, [k, v]) => ({...acc, [k]: v}), {});"
            )

            # 尋找 token (可能的 key: token, authToken, jwt, accessToken 等)
            token_keys = ['token', 'authToken', 'jwt', 'accessToken', 'jwtToken', 'auth_token', 'access_token']
            for storage_name, storage in [('localStorage', local_storage), ('sessionStorage', session_storage)]:
                for key in token_keys:
                    if key in storage:
                        self.auth_token = storage[key]
                        print(f"已取得 JWT token (from {storage_name}.{key})")
                        break
                    # 也檢查包含這些關鍵字的 key
                    for k, v in storage.items():
                        if any(tk in k.lower() for tk in ['token', 'jwt', 'auth']):
                            if isinstance(v, str) and len(v) > 50:  # JWT 通常很長
                                self.auth_token = v
                                print(f"已取得 JWT token (from {storage_name}.{k})")
                                break
                if self.auth_token:
                    break

            if not self.auth_token:
                print(f"警告: 未找到 JWT token")
                print(f"localStorage keys: {list(local_storage.keys())}")
                print(f"sessionStorage keys: {list(session_storage.keys())}")
                # 印出可能的 token 值供除錯
                for storage_name, storage in [('localStorage', local_storage), ('sessionStorage', session_storage)]:
                    for k, v in storage.items():
                        if isinstance(v, str) and len(v) > 20:
                            print(f"  {storage_name}.{k}: {v[:50]}...")

        except Exception as e:
            print(f"取得 JWT token 失敗: {e}")
            import traceback
            traceback.print_exc()

        # 關閉瀏覽器，後續使用 requests
        self.driver.quit()
        self.driver = None
        print("已關閉瀏覽器，後續將使用 requests")

    def get_invoices(self, months: int = 3) -> List[Invoice]:
        """
        使用 requests 取得發票列表

        Args:
            months: 查詢最近幾個月的發票

        Returns:
            發票列表
        """
        import requests

        if not self.cookies:
            raise Exception("尚未登入，請先呼叫 login()")

        print(f"\n正在查詢最近 {months} 個月的發票...")

        invoices = []

        # 計算日期範圍 (使用 UTC 時間)
        # 注意: API 對查詢區間有限制，使用當月1日到今天
        from datetime import timezone
        end_date = datetime.now(timezone.utc)
        # 當月1日
        start_date = end_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # API 端點 - 取得發票列表 (含 JWT token)
        api_url = "https://service-mc.einvoice.nat.gov.tw/btc/cloud/api/btc502w/getSearchCarrierInvoiceListJWT"

        headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Origin': 'https://www.einvoice.nat.gov.tw',
            'Referer': 'https://www.einvoice.nat.gov.tw/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

        # 加入 JWT Authorization header
        if self.auth_token:
            headers['Authorization'] = f'Bearer {self.auth_token}'
            print(f"使用 JWT token 進行 API 認證")
        else:
            print("警告: 沒有 JWT token，API 可能會返回 401")

        # 請求 payload (日期格式: ISO 8601 UTC 格式，結尾為 Z)
        # API 查詢區間限制較嚴格，使用當月1日到今天
        payload = {
            "cardCode": "",
            "carrierId2": "",
            "invoiceStatus": "all",
            "isSearchAll": "true",  # 字串格式
            "searchStartDate": start_date.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
            "searchEndDate": end_date.strftime('%Y-%m-%dT%H:%M:%S.000Z')
        }
        
        print(f"查詢區間: {start_date.strftime('%Y-%m-%d')} ~ {end_date.strftime('%Y-%m-%d')}")

        try:
            # 第一步：呼叫 API 取得查詢用的 JWT token
            response = requests.post(
                api_url,
                headers=headers,
                cookies=self.cookies,
                json=payload,
                timeout=30
            )

            print(f"API 回應狀態: {response.status_code}")

            if response.status_code == 200 and response.text:
                jwt_token = response.text.strip()
                print(f"取得查詢 JWT token: {jwt_token[:80]}...")
                
                # 第二步：使用 token 作為 payload 呼叫 searchCarrierInvoice
                search_url = "https://service-mc.einvoice.nat.gov.tw/btc/cloud/api/btc502w/searchCarrierInvoice"
                
                search_headers = {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {self.auth_token}' if self.auth_token else '',
                    'Origin': 'https://www.einvoice.nat.gov.tw',
                    'Referer': 'https://www.einvoice.nat.gov.tw/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
                
                # payload 是 { token: "JWT字串" }
                search_payload = {"token": jwt_token}
                
                search_response = requests.post(
                    search_url,
                    headers=search_headers,
                    cookies=self.cookies,
                    json=search_payload,
                    timeout=30
                )
                
                print(f"發票列表 API 回應狀態: {search_response.status_code}")
                print(f"發票列表回應: {search_response.text[:500] if search_response.text else '(空)'}")
                
                if search_response.status_code == 200 and search_response.text:
                    data = search_response.json()
                    
                    # 解析回應中的發票列表 (在 content 欄位)
                    invoice_list = data.get('content', [])
                    
                    if isinstance(invoice_list, list) and len(invoice_list) > 0:
                        print(f"共找到 {len(invoice_list)} 筆發票")
                        for item in invoice_list:
                            # 取得發票的 token 來查詢明細
                            invoice_token = item.get('token', '')
                            
                            # 先解析基本資訊
                            invoice_number = item.get('invoiceNumber', '')
                            invoice_date_raw = item.get('invoiceDate', '')
                            seller_name = item.get('sellerName', '未知商店')
                            amount = int(item.get('totalAmount', 0))
                            
                            # 轉換日期格式
                            if invoice_date_raw:
                                invoice_date = str(invoice_date_raw)[:10]
                            else:
                                invoice_date = datetime.now().strftime('%Y-%m-%d')
                            
                            # 取得消費明細
                            details = None
                            if invoice_token:
                                details = self._get_invoice_details(invoice_token)
                            
                            invoice = Invoice(
                                invoice_number=invoice_number,
                                invoice_date=invoice_date,
                                seller_name=seller_name,
                                amount=amount,
                                details=details
                            )
                            invoices.append(invoice)
                            print(f"  ✓ {invoice.invoice_date} | {invoice.seller_name[:15]:15} | ${invoice.amount:>6}")
                            if details:
                                print(f"  明細: {details[:50]}...")
                    else:
                        print(f"沒有找到發票")
                        print(f"完整回應: {json.dumps(data, ensure_ascii=False, indent=2)[:1000]}")
                else:
                    print(f"發票列表 API 請求失敗: {search_response.status_code}")

            else:
                print(f"API 請求失敗: {response.status_code}")
                print(f"回應內容: {response.text[:500] if response.text else '(空)'}")

        except Exception as e:
            print(f"取得發票列表失敗: {e}")
            import traceback
            traceback.print_exc()

        return invoices
    
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
            else:
                print("response", response.text)
                return None
                    
        except Exception as e:
            print(f"取得明細失敗: {e}")
        
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
                else:
                    print(f"API 回應錯誤: {data.get('message', data)}")

            else:
                print(f"API 請求失敗: {response.status_code}")

        except Exception as e:
            print(f"API 請求異常: {e}")

        return None


    def close(self):
        """關閉瀏覽器"""
        if self.driver:
            self.driver.quit()
            print("瀏覽器已關閉")


def main():
    """主程式"""
    load_dotenv()

    phone = os.getenv('EINVOICE_PHONE')
    password = os.getenv('EINVOICE_PASSWORD')

    if not phone or not password:
        print("請設定環境變數:")
        print("  EINVOICE_PHONE=你的手機號碼")
        print("  EINVOICE_PASSWORD=你的密碼")
        print("\n或建立 .env 檔案")
        sys.exit(1)

    print("=== 財政部電子發票爬蟲 ===\n")

    scraper = EInvoiceScraper(
        phone=phone,
        password=password,
        headless=True  # 首次使用建議設為 False 以便觀察
    )

    try:
        # 登入
        if not scraper.login():
            print("登入失敗，程式結束")
            sys.exit(1)

        # 取得發票
        invoices = scraper.get_invoices(months=1)

        print(f"\n{'='*50}")
        print(f"共取得 {len(invoices)} 筆發票")
        print('='*50)

        # 轉換為 JSON 格式
        result = []
        for inv in invoices:
            result.append({
                "日期": inv.invoice_date,
                "發票號碼": inv.invoice_number,
                "店家": inv.seller_name,
                "金額": inv.amount,
                "明細": inv.details
            })
        
        # 輸出 JSON
        print(json.dumps(result, ensure_ascii=False, indent=2))

    except Exception as e:
        print(f"\n發生錯誤: {e}")
        import traceback
        traceback.print_exc()

    finally:
        scraper.close()


if __name__ == "__main__":
    main()
