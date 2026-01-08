"""
供 Node.js API Route 呼叫的發票查詢腳本
輸出 JSON 格式的發票列表

使用方式:
    python get_invoices.py

環境變數:
    EINVOICE_PHONE: 手機號碼
    EINVOICE_PASSWORD: 密碼
"""

import sys
import os
import json
import io
from contextlib import redirect_stdout, redirect_stderr
from dataclasses import asdict


def main():
    """主程式 - 輸出 JSON 格式的發票列表"""

    # 捕獲所有 stdout/stderr，只在最後輸出 JSON
    log_buffer = io.StringIO()

    try:
        # 檢查環境變數
        phone = os.getenv('EINVOICE_PHONE')
        password = os.getenv('EINVOICE_PASSWORD')

        if not phone or not password:
            print(json.dumps({
                'success': False,
                'error': '未設定 EINVOICE_PHONE 或 EINVOICE_PASSWORD 環境變數'
            }, ensure_ascii=False))
            sys.exit(1)

        # 將所有 print 輸出導向 log buffer
        with redirect_stdout(log_buffer), redirect_stderr(log_buffer):
            from einvoice_scraper import EInvoiceScraper

            scraper = EInvoiceScraper(
                phone=phone,
                password=password,
                headless=True  # API 模式使用無頭瀏覽器
            )

            try:
                # 登入
                if not scraper.login():
                    raise Exception("登入失敗")

                # 取得發票
                invoices = scraper.get_invoices()

            finally:
                scraper.close()

        # 轉換為 dict 列表
        result = []
        for inv in invoices:
            result.append({
                'invoiceNumber': inv.invoice_number,
                'invoiceDate': inv.invoice_date,
                'sellerName': inv.seller_name,
                'amount': inv.amount,
                'details': inv.details
            })

        # 輸出 JSON 到 stdout
        print(json.dumps({
            'success': True,
            'data': result,
            'count': len(result)
        }, ensure_ascii=False))

    except Exception as e:
        # 錯誤處理
        error_msg = str(e)

        # 如果有 logs，加到錯誤訊息中供除錯
        logs = log_buffer.getvalue()

        print(json.dumps({
            'success': False,
            'error': error_msg,
            'logs': logs[-1000:] if len(logs) > 1000 else logs
        }, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
