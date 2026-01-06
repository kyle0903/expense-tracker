"""
OpenAI 發票分類服務
根據商店名稱和明細自動判斷名稱和分類
"""

import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# 分類及其名稱建議
CATEGORY_SUGGESTIONS = {
    "餐飲": ["早餐", "午餐", "晚餐", "宵夜", "飲料", "咖啡", "外送"],
    "交通": ["加油費", "捷運", "公車", "停車費", "高鐵", "火車", "Uber"],
    "購物": ["日用品", "服飾", "3C產品", "網購", "超市"],
    "日常": ["手機費", "房租", "水費", "電費", "瓦斯費", "網路費", "管理費"],
    "娛樂": ["電影", "遊戲", "訂閱", "KTV", "旅遊", "運動", "韓團周邊"],
    "醫療": ["看診", "藥品", "保健食品", "牙醫"],
    "教育": ["課程", "書籍", "文具", "補習費"],
    "其他": ["手續費", "保險", "禮物", "捐款"],
}

# 可用分類 (支出類)
CATEGORIES = list(CATEGORY_SUGGESTIONS.keys())


def classify_invoice(seller_name: str, details: str) -> dict:
    """
    使用 OpenAI 分類發票
    
    Args:
        seller_name: 商店名稱
        details: 消費明細
    
    Returns:
        {
            "name": "飲料",
            "category": "餐飲"
        }
    """
    client = OpenAI()
    
    # 建立分類提示
    category_hints = "\n".join([
        f"- {cat}: {', '.join(names)}"
        for cat, names in CATEGORY_SUGGESTIONS.items()
    ])
    
    prompt = f"""根據以下發票資訊，判斷消費的「名稱」和「分類」。

商店: {seller_name}
明細: {details}

分類及建議名稱:
{category_hints}

請回覆 JSON 格式:
{{"name": "簡短名稱", "category": "分類"}}

規則:
- 名稱從建議名稱中選擇最合適的，或自行判斷簡短精確的名稱 (2-4字)
- 分類必須是上述分類之一
- 便利商店購買食物/飲料歸類為「餐飲」，名稱可為「飲料」或「早餐」等
- 便利商店購買日用品歸類為「購物」

只回覆 JSON，不要有其他文字。"""

    try:
        response = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "user", "content": prompt}
            ],
            max_tokens=100,
            temperature=0.3
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # 移除可能的 markdown 標記
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
        
        import json
        result = json.loads(result_text)
        
        # 驗證分類
        if result.get("category") not in CATEGORIES:
            result["category"] = "其他"
        
        return result
        
    except Exception as e:
        print(f"OpenAI 分類失敗: {e}")
        # 預設回傳
        return {
            "name": "消費",
            "category": "其他"
        }


if __name__ == "__main__":
    # 測試
    result = classify_invoice(
        seller_name="統一超商股份有限公司台北市第九三七分公司",
        details="拿鐵熱咖啡(大) x1 $55"
    )
    print(result)
