
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.db import get_db
from app.services.frankfurter import get_latest_rate
from app.services.alert_checker import evaluate_alert



router = APIRouter(
    prefix="/api/alerts",
    tags=["Alerts"]
)

Currency = Literal["TWD", "MYR", "USD", "JPY", "EUR"]
Operator = Literal["<=", ">="]

# 資料驗證模型

class AlertCreate(BaseModel):
    base: Currency
    quote: Currency
    operator: Operator
    target_rate: Decimal = Field(gt=0)
    enabled: bool = True

    @model_validator(mode="after")
    def check_currencies(self):
        if self.base == self.quote:
            raise ValueError("來源與目標貨幣不能相同")
        return self


class AlertUpdate(BaseModel):
    base: Currency | None = None
    quote: Currency | None = None
    operator: Operator | None = None
    target_rate: Decimal | None = Field(default=None, gt=0)
    enabled: bool | None = None


def row_to_dict(row):
    """將 SQLite 資料轉成 API 回應格式。"""
    result = dict(row)
    result["enabled"] = bool(result["enabled"])
    return result


def find_alert(conn, alert_id: str):
    """根據 ID 查詢提醒。"""
    row = conn.execute(
        "SELECT * FROM alerts WHERE id = ?",
        (alert_id,)
    ).fetchone()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="找不到指定的匯率提醒"
        )

    return row


@router.post("", status_code=201)
def create_alert(alert: AlertCreate):

    alert_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()

    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO alerts (
                id, base, quote, operator,
                target_rate, enabled,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                alert_id,
                alert.base,
                alert.quote,
                alert.operator,
                str(alert.target_rate),
                int(alert.enabled),
                now,
                now
            )
        )

        row = find_alert(conn, alert_id)
        return row_to_dict(row)



@router.get("")
def list_alerts():

    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM alerts ORDER BY created_at DESC"
        ).fetchall()

    return [row_to_dict(row) for row in rows]


@router.get("/{alert_id}")
def get_alert(alert_id: str):

    with get_db() as conn:
        row = find_alert(conn, alert_id)
        return row_to_dict(row)


@router.put("/{alert_id}")
def update_alert(alert_id: str, update: AlertUpdate):

    with get_db() as conn:
        old_row = find_alert(conn, alert_id)
        old = row_to_dict(old_row)

        # 只更新使用者有提供的欄位
        changes = update.model_dump(exclude_unset=True)

        if any(value is None for value in changes.values()):
            raise HTTPException(
                status_code=422,
                detail="修改欄位不可為 null"
            )

        merged = {
            "base": old["base"],
            "quote": old["quote"],
            "operator": old["operator"],
            "target_rate": old["target_rate"],
            "enabled": old["enabled"]
        }

        merged.update(changes)

        # 重新驗證修改後的完整資料
        validated = AlertCreate.model_validate(merged)

        now = datetime.now(timezone.utc).isoformat()

        monitored_fields = {
            "base",
            "quote",
            "operator",
            "target_rate"
        }

        reset_state = (
            any(
                field in changes
                for field in monitored_fields
            )
            or (
                changes.get("enabled") is True
                and not old["enabled"]
            )
        )

        new_condition_met = (
            0 if reset_state
            else int(old["condition_met"])
        )

        new_last_checked_at = (
            None if reset_state
            else old["last_checked_at"]
        )


        conn.execute(
            """
            UPDATE alerts
            SET base = ?,
                quote = ?,
                operator = ?,
                target_rate = ?,
                enabled = ?,
                updated_at = ?,
                condition_met = ?,
                last_checked_at = ?
            WHERE id = ?
            """,
            (
                validated.base,
                validated.quote,
                validated.operator,
                str(validated.target_rate),
                int(validated.enabled),
                now,
                new_condition_met,
                new_last_checked_at,
                alert_id
            )
        )
        

        row = find_alert(conn, alert_id)
        return row_to_dict(row)


@router.delete("/{alert_id}")
def delete_alert(alert_id: str):

    with get_db() as conn:
        find_alert(conn, alert_id)

        conn.execute(
            "DELETE FROM alerts WHERE id = ?",
            (alert_id,)
        )

    return {
        "message": "匯率提醒已刪除",
        "id": alert_id
    }



# ----------------------------------
# Check：檢查啟用中的匯率提醒
# ----------------------------------

@router.post("/check")
async def check_alerts():

    # 1. 讀取所有啟用中的提醒
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM alerts WHERE enabled = 1"
        ).fetchall()

        alerts = [row_to_dict(row) for row in rows]

    # 2. 相同貨幣組合只查詢一次匯率
    rate_cache = {}

    results = []
    errors = []

    for alert in alerts:

        pair = (alert["base"], alert["quote"])

        # 3. 向 Frankfurter 查詢最新匯率
        if pair not in rate_cache:
            try:
                data = await get_latest_rate(
                    alert["base"],
                    alert["quote"]
                )

                rate_cache[pair] = {
                    "rate": Decimal(str(data["rate"])),
                    "date": data["date"]
                }

            except HTTPException as exc:
                errors.append({
                    "pair": f"{pair[0]}/{pair[1]}",
                    "error": exc.detail
                })

                # 記錄失敗，避免重複請求同一幣別
                rate_cache[pair] = None

        rate_data = rate_cache[pair]

        if rate_data is None:
            continue

        current_rate = rate_data["rate"]

        # 4. 計算此次檢查時間
        now = datetime.now(timezone.utc).isoformat()

        # 5. 在資料庫中更新判斷狀態
        with get_db() as conn:

            # 先取得最新的提醒狀態
            row = conn.execute(
                """
                SELECT * FROM alerts
                WHERE id = ? AND enabled = 1
                """,
                (alert["id"],)
            ).fetchone()

            if row is None:
                continue

            current_alert = row_to_dict(row)

            evaluation = evaluate_alert(
                current_rate=current_rate,
                target_rate=Decimal(
                    current_alert["target_rate"]
                ),
                operator=current_alert["operator"],
                previously_met=bool(
                    current_alert["condition_met"]
                )
            )

            condition_met = evaluation["condition_met"]

            # 6. 嘗試將未達標變成已達標
            triggered = False

            if condition_met:
                cursor = conn.execute(
                    """
                    UPDATE alerts
                    SET condition_met = 1,
                        last_checked_at = ?,
                        last_triggered_at = ?
                    WHERE id = ?
                      AND enabled = 1
                      AND condition_met = 0
                    """,
                    (
                        now,
                        now,
                        alert["id"]
                    )
                )

                # 只有真正完成狀態轉換才算新觸發
                triggered = cursor.rowcount == 1

                if not triggered:
                    conn.execute(
                        """
                        UPDATE alerts
                        SET last_checked_at = ?
                        WHERE id = ? AND enabled = 1
                        """,
                        (now, alert["id"])
                    )

            else:
                # 不達標時解除已達標狀態
                conn.execute(
                    """
                    UPDATE alerts
                    SET condition_met = 0,
                        last_checked_at = ?
                    WHERE id = ? AND enabled = 1
                    """,
                    (now, alert["id"])
                )

        # 7. 整理本次檢查結果
        results.append({
            "id": alert["id"],
            "base": alert["base"],
            "quote": alert["quote"],
            "current_rate": str(current_rate),
            "rate_date": rate_data["date"],
            "operator": current_alert["operator"],
            "target_rate": current_alert["target_rate"],
            "condition_met": condition_met,
            "triggered": triggered
        })

    return {
        "checked_count": len(results),
        "triggered_count": sum(
            1 for item in results if item["triggered"]
        ),
        "results": results,
        "errors": errors
    }
