
from decimal import Decimal


def is_target_reached(
    current_rate: Decimal,
    target_rate: Decimal,
    operator: str
) -> bool:
    """判斷目前匯率是否達到目標。"""

    if operator == "<=":
        return current_rate <= target_rate

    elif operator == ">=":
        return current_rate >= target_rate

    else:
        raise ValueError("不支援的比較運算子")


def evaluate_alert(
    current_rate: Decimal,
    target_rate: Decimal,
    operator: str,
    previously_met: bool
) -> dict:
    """判斷條件及是否需要產生新的提醒事件。"""

    condition_met = is_target_reached(
        current_rate,
        target_rate,
        operator
    )

    # 只有從未達標轉為達標，才算新觸發
    should_trigger = condition_met and not previously_met

    return {
        "condition_met": condition_met,
        "should_trigger": should_trigger
    }
