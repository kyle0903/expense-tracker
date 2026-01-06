# 電子發票爬蟲 FastAPI Docker 映像
# 包含 Python、Chromium 和所有依賴

FROM python:3.11-slim

# 設定環境變數
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive

# 安裝系統依賴和 Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    curl \
    chromium \
    chromium-driver \
    # Chromium 依賴
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libdrm2 \
    libgbm1 \
    libxkbcommon0 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# 設定 Chrome 環境變數（給 Selenium 使用）
ENV CHROME_BIN=/usr/bin/chromium
ENV CHROMEDRIVER_PATH=/usr/bin/chromedriver

# 設定工作目錄
WORKDIR /app

# 複製 requirements 並安裝依賴
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製應用程式碼
COPY *.py .

# 暴露端口
EXPOSE 8000

# 啟動 FastAPI
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
