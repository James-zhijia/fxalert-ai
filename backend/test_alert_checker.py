
from decimal import Decimal

from app.services.alert_checker import evaluate_alert


def test_alert_checker():

    target = Decimal("7.80")

    # 第一次：沒有達標
    result1 = evaluate_alert(
        Decimal("7.60"), target, ">=", False
    )

    assert result1["should_trigger"] is False

    # 第二次：第一次達標
    result2 = evaluate_alert(
        Decimal("7.85"), target, ">=", False
    )

    assert result2["should_trigger"] is True

    # 第三次：持續達標，不重複觸發
    result3 = evaluate_alert(
        Decimal("7.90"), target, ">=", True
    )

    assert result3["should_trigger"] is False

    # 第四次：恢復未達標
    result4 = evaluate_alert(
        Decimal("7.70"), target, ">=", True
    )

    assert result4["condition_met"] is False

    # 第五次：再次達標
    result5 = evaluate_alert(
        Decimal("7.82"), target, ">=", False
    )

    assert result5["should_trigger"] is True
