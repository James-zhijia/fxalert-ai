from datetime import date, timedelta

import httpx
from fastapi import HTTPException

# Frankfurter API 的網址
BASE_URL = "https://api.frankfurter.dev/v2"


async def get_latest_rate(base: str, quote: str):
    """
    查詢最新參考匯率。

    base：來源貨幣，例如 USD
    quote：目標貨幣，例如 TWD
    """

    url = f"{BASE_URL}/rate/{base}/{quote}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)

       
            response.raise_for_status()

            data = response.json()

            # 驗證資料欄位
            if (
                not isinstance(data, dict)
                or "rate" not in data
                or "date" not in data
            ):
                raise HTTPException(
                    status_code=502,
                    detail="匯率資料格式不正確"
                )

            return data

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="匯率服務回應逾時"
        )

    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502,
            detail="第三方匯率服務回傳錯誤"
        )

    except (httpx.RequestError, ValueError):
        raise HTTPException(
            status_code=502,
            detail="無法取得有效的匯率資料"
        )


async def get_historical_rates(
    base: str,
    quote: str,
    days: int
):
    """
    取得指定貨幣組合的歷史匯率。
    支援最近 7、30、90 天。
    """

    # 1. 計算查詢日期範圍
    end_date = date.today()
    start_date = end_date - timedelta(days=days - 1)

    # 2. 設定 Frankfurter API 參數
    params = {
        "from": start_date.isoformat(),
        "to": end_date.isoformat(),
        "base": base,
        "quotes": quote
    }

    url = f"{BASE_URL}/rates"

    # 3. 向第三方 API 發送請求
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                url,
                params=params
            )

            response.raise_for_status()
            data = response.json()

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="歷史匯率服務回應逾時"
        )

    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502,
            detail="第三方歷史匯率服務發生錯誤"
        )

    except (httpx.RequestError, ValueError):
        raise HTTPException(
            status_code=502,
            detail="無法取得有效的歷史匯率資料"
        )

    # 4. 確認回傳的是列表
    if not isinstance(data, list):
        raise HTTPException(
            status_code=502,
            detail="歷史匯率資料格式不正確"
        )

    # 5. 依照日期由舊到新排序
    try:
        data = sorted(
            data,
            key=lambda item: item["date"]
        )
    except (KeyError, TypeError):
        raise HTTPException(
            status_code=502,
            detail="歷史匯率缺少日期資料"
        )

    return data
