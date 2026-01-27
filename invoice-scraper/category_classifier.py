"""
OpenAI 發票分類服務
根據商店名稱和明細自動判斷名稱和分類
"""

from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# 分類及其名稱建議
CATEGORY_SUGGESTIONS = {
    "餐飲": ["早餐", "午餐", "晚餐", "零食", "宵夜", "飲料", "咖啡", "外送"],
    "交通": ["加油費", "捷運", "公車", "停車費", "高鐵", "火車", "Uber"],
    "購物": ["日用品", "服飾", "3C產品", "網購", "超市"],
    "日常": ["手機費用", "房租", "水費", "電費", "瓦斯費", "網路費", "管理費"],
    "娛樂": ["電影", "遊戲", "訂閱", "KTV", "旅遊", "運動", "韓團周邊"],
    "醫療": ["看診", "藥品", "保健食品", "牙醫"],
    "學習": ["課程", "書籍"],
    "其他": ["手續費", "保險", "禮物", "捐款"],
}

# 可用分類 (支出類)
CATEGORIES = list(CATEGORY_SUGGESTIONS.keys())


def classify_invoice(seller_name: str, details: str, transaction_time: str = None) -> dict:
    """
    使用 OpenAI 分類發票
    
    Args:
        seller_name: 商店名稱
        details: 消費明細
        transaction_time: 交易時間 (HH:MM 格式，例如 "12:30")
    
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
    
    # 時間相關提示
    time_context = ""
    if transaction_time:
        time_context = f"\n交易時間: {transaction_time}"
    
    prompt = f"""根據以下發票資訊，判斷消費的「名稱」和「分類」。

商店: {seller_name}
明細: {details}{time_context}

分類及建議名稱:
{category_hints}

請回覆 JSON 格式:
{{"name": "簡短名稱", "category": "分類"}}

規則:
- 名稱從建議名稱中選擇最合適的，或自行判斷簡短精確的名稱 (2-4字)
- 分類必須是上述分類之一
- 便利商店購買食物/飲料歸類為「餐飲」，名稱可為「飲料」或「早餐」等
- 便利商店購買日用品歸類為「購物」

餐飲名稱判斷規則 (依優先順序):
1. 若明細「只有飲料」(無任何食物)，名稱必須是「飲料」，不管什麼時間
2. 若判斷食物名稱都是零食(不是飲料也不是正餐)，則名稱為「零食」，例如，軟糖、巧克力、餅乾等等
2. 若有食物，根據交易時間判斷:
   - 05:00-10:59 → 早餐
   - 11:00-13:59 → 午餐
   - 18:00-21:59 → 晚餐
   - 22:00-04:59 → 宵夜

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
    # 測試 1: 午餐時段買食物 + 飲料 → 午餐
    result = classify_invoice(
        seller_name="全家便利商店股份有限公司",
        details="一日蔬果100%蜜桃綜合蔬果汁 x2 $76\n21Plus蒜香鹽酥雞 x1 $59\n握便當-黑胡椒烤雞 x1 $59\n金馬飲料2件79折4件75折0107*1XZ x1 $-16",
        transaction_time="12:19"
    )
    print("12:19 買食物+飲料:", result)
    
    # 測試 2: 下午買飯糰 → 下午茶
    result = classify_invoice(
        seller_name="統一超商股份有限公司",
        details="海苔飯糰 x1 $35",
        transaction_time="14:30"
    )
    print("14:30 買飯糰:", result)
    
    # 測試 3: 任何時段只買飲料 → 飲料
    result = classify_invoice(
        seller_name="統一超商股份有限公司",
        details="拿鐵熱咖啡(大) x1 $55",
        transaction_time="08:00"
    )
    print("08:00 只買咖啡:", result)

    result = classify_invoice(
        seller_name="統一超商股份有限公司",
        details="日式炒飯 x1 $55",
        transaction_time="13:00"
    )
    print("13:00 買食物:", result)

    result = classify_invoice(
        seller_name="三元國際有限公司",
        details="運動服 x1 $155",
        transaction_time="13:00"
    )
    print("13:00 買衣服:", result)
