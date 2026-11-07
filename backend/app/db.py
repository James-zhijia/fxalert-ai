
import sqlite3
from pathlib import Path
from contextlib import contextmanager

# 資料庫位置：backend/fxalert.db
DB_PATH = Path(__file__).resolve().parents[1] / "fxalert.db"


@contextmanager
def get_db():
    """建立資料庫連線，使用後自動關閉。"""
    conn = sqlite3.connect(DB_PATH)

    # 查詢結果可以用欄位名稱讀取
    conn.row_factory = sqlite3.Row

    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()



def init_db():
    """建立資料表並補上提醒監控欄位。"""

    with get_db() as conn:

        # 建立提醒資料表
        conn.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                id TEXT PRIMARY KEY,
                base TEXT NOT NULL,
                quote TEXT NOT NULL,
                operator TEXT NOT NULL,
                target_rate TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        # 查詢目前有哪些欄位
        columns = {
            row["name"]
            for row in conn.execute(
                "PRAGMA table_info(alerts)"
            ).fetchall()
        }

        # 新增條件是否達標欄位
        if "condition_met" not in columns:
            conn.execute("""
                ALTER TABLE alerts
                ADD COLUMN condition_met INTEGER
                NOT NULL DEFAULT 0
            """)

        # 新增最後檢查時間
        if "last_checked_at" not in columns:
            conn.execute("""
                ALTER TABLE alerts
                ADD COLUMN last_checked_at TEXT
            """)

        # 新增最後觸發時間
        if "last_triggered_at" not in columns:
            conn.execute("""
                ALTER TABLE alerts
                ADD COLUMN last_triggered_at TEXT
            """)

