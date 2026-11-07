from app.db import init_db
from app.routers.alerts import router as alerts_router

from pathlib import Path
from fastapi.staticfiles import StaticFiles

from decimal import Decimal, ROUND_HALF_UP
from fastapi import HTTPException
from typing import Literal

from fastapi import FastAPI, Query, HTTPException

from app.services.frankfurter import (
     get_latest_rate,
    get_historical_rates
)
    



app = FastAPI(
    title="FXAlert AI API",
    description="雲端匯率監控與換匯提醒系統",
    version="0.1.0",
)

init_db()
app.include_router(alerts_router)

@app.get("/")
def home():
    return {
        "message": "Welcome to FXAlert AI",
        "status": "running"
    }


@app.get("/health")
def health_check():
    return {
        "status": "ok"
    }


# 目前支援的貨幣種類
Currency = Literal["USD", "TWD", "MYR", "JPY", "EUR"]


@app.get("/api/rates/latest")
async def latest_rate(
    base: Currency = "USD",
    quote: Currency = "TWD"
):

    # 相同貨幣的匯率一定是 1
    if base == quote:
        return {
            "base": base,
            "quote": quote,
            "rate": 1,
            "date": None,
            "source": "Identity conversion"
        }

    # 去Frankfurter API 拿到匯率
    data = await get_latest_rate(base, quote)

    return {
        "base": data["base"],
        "quote": data["quote"],
        "rate": data["rate"],
        "date": data["date"],
        "source": "Frankfurter v2"
    }


@app.get("/api/convert")
async def convert_currency(
    amount: Decimal = Query(
        default=Decimal("100"),
        ge=0,
        le=1000000000,
        description="要換算的金額"
    ),
    base: Currency = "USD",
    quote: Currency = "TWD"
):
    """
    貨幣換算 API
    例如：100 USD 轉換成 TWD
    """

    # 如果來源貨幣和目標貨幣相同
    if base == quote:
        rate = Decimal("1")
        rate_date = None
        source = "Identity conversion"

    else:
        # 取得最新匯率
        data = await get_latest_rate(base, quote)

        # 將匯率轉換為 Decimal
        rate = Decimal(str(data["rate"]))
        rate_date = data["date"]
        source = "Frankfurter v2"

    # 計算換算後的金額
    converted_amount = amount * rate

    # 將金額四捨五入到小數點後兩位
    converted_amount = converted_amount.quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP
    )

    # 回傳換算結果
    return {
        "amount": str(amount),
        "base": base,
        "quote": quote,
        "rate": str(rate),
        "converted_amount": str(converted_amount),
        "date": rate_date,
        "source": source
    }


@app.get("/api/rates/history")
async def historical_rates(base: Currency = "USD",
    quote: Currency = "TWD",
     days: int = Query(
        default=30,
        description="查詢天數：7、30 或 90"
    )
    
):
    if days not in (7, 30, 90):
        raise HTTPException(
            status_code=422,
            detail="查詢天數只能是 7、30 或 90"
        )
    """
    查詢最近 7、30、90 天歷史匯率，
    並計算最高、最低及漲跌幅。
    """

    # 1. 不允許相同貨幣的歷史走勢
    if base == quote:
        raise HTTPException(
            status_code=400,
            detail="請選擇兩種不同的貨幣"
        )

    # 2. 從 Frankfurter 取得歷史資料
    data = await get_historical_rates(
        base,
        quote,
        days
    )

    # 3. 確認資料是否為空
    if not data:
        raise HTTPException(
            status_code=404,
            detail="查詢期間沒有可用匯率資料"
        )

    # 4. 將匯率轉換成 Decimal
    try:
        rates = [
            Decimal(str(item["rate"]))
            for item in data
        ]

        # 5. 計算統計數據
        highest = max(rates)
        lowest = min(rates)

        first_rate = rates[0]
        last_rate = rates[-1]

        if first_rate <= 0:
            raise ValueError("匯率必須大於 0")

        change_percent = (
            (last_rate - first_rate)
            / first_rate
        ) * 100

    except (KeyError, TypeError, ValueError, ArithmeticError):
        raise HTTPException(
            status_code=502,
            detail="歷史匯率資料無法計算"
        )

    # 6. 回傳結果
    return {
        "base": base,
        "quote": quote,
        "requested_days": days,
        "start_date": data[0]["date"],
        "end_date": data[-1]["date"],
        "data_points": len(data),
        "data": data,
        "statistics": {
            "highest": str(highest),
            "lowest": str(lowest),
            "first_rate": str(first_rate),
            "last_rate": str(last_rate),
            "change_percent": str(
                change_percent.quantize(Decimal("0.01"))
            )
        },
        "source": "Frankfurter v2"
    }


# 目錄：fxalert-ai
PROJECT_ROOT = Path(__file__).resolve().parents[2]

# 前端的資料夾
FRONTEND_DIR = PROJECT_ROOT / "frontend"

# 這邊是 FastAPI 會提供前端的網頁出來
app.mount(
    "/dashboard",
    StaticFiles(
        directory=FRONTEND_DIR,
        html=True
    ),
    name="dashboard"
)
