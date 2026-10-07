# -*- coding: utf-8 -*-
"""
Vivifrail 體能測試系統 Pro - 診間資料庫實時對接橋樑 (PostgreSQL)
這是一個極簡、高效且支援跨網域 CORS 的 Python FastAPI 輕量級 API 伺服器。
它可以部署在您安裝 PostgreSQL 17 (pgAdmin) 的診間電腦上。

功能：
1. 當您在網頁端點選「🚀 SQL 資料上傳」時，將所有受測名單與 SPPB 紀錄一次寫入本機 SQL 資料庫中。
2. 當您點選「🔄 同步本地登入資料」時，將本機 SQL 資料庫的長輩名單安全同步回瀏覽器中。

預估依賴安裝：
pip install fastapi uvicorn psycopg2-binary
"""

import os
import json
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn
import psycopg2
from psycopg2.extras import RealDictCursor

app = FastAPI(
    title="Vivifrail Clinic SQL Sync API Host",
    description="診間本機 PostgreSQL 自動對接與實時數據寫入服務",
    version="1.0"
)

# 🔔 啟用跨網域 CORS 權限，允許您的 Vivifrail 雲端網頁版安全串接此本機 API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允許任何發入請求 (亦可限制為您的雲端 preview 網址)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================================
# 🛠 1. 資料庫連線配置 (已依照您的研究資料庫設定更新)
# =====================================================================
DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "dbname": "VIVIFRAIL",
    "user": "postgres",
    "password": "YOUR_PASSWORD_HERE"  # ⚠️ 請在此處填入您 pgAdmin 中 postgres 帳號的密碼
}

def get_db_connection():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        print(f"❌ 無法連線至 PostgreSQL 資料庫 nutrigenius！請確認密碼或服務是否啟動：{e}")
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")

# =====================================================================
# 📄 2. 啟動時自動檢查並建立 Table 結構 (若您的資料庫尚未執行過 SQL)
# =====================================================================
@app.on_event("startup")
def init_tables():
    print("🔬 正在初始化資料庫 Table 檢查...")
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # 建立受測長輩表 (sppb_users)
        cur.execute("""
        CREATE TABLE IF NOT EXISTS sppb_users (
            uid VARCHAR(128) PRIMARY KEY,
            display_name VARCHAR(256) NOT NULL,
            email VARCHAR(256) NOT NULL UNIQUE,
            age INT,
            gender VARCHAR(32),
            height FLOAT,
            weight FLOAT,
            created_at BIGINT
        );
        """)
        
        # 建立評估與復健紀錄表 (sppb_records)
        cur.execute("""
        CREATE TABLE IF NOT EXISTS sppb_records (
            id SERIAL PRIMARY KEY,
            user_uid VARCHAR(128) NOT NULL,
            record_type VARCHAR(64) NOT NULL,
            record_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            total_score INT NOT NULL,
            balance_score INT NOT NULL,
            walk_score INT NOT NULL,
            chair_score INT NOT NULL,
            raw_walk_time FLOAT,
            raw_chair_time FLOAT,
            raw_balance_side_by_side FLOAT,
            raw_balance_semi_tandem FLOAT,
            raw_balance_tandem FLOAT,
            additional_details TEXT,
            created_at BIGINT NOT NULL,
            FOREIGN KEY (user_uid) REFERENCES sppb_users(uid) ON DELETE CASCADE
        );
        """)
        conn.commit()
        print("✅ sppb_users 與 sppb_records 表結構檢查/建立完成！")
    except Exception as e:
        conn.rollback()
        print(f"❌ 表結構初始化失敗: {e}")
    finally:
        cur.close()
        conn.close()

# =====================================================================
# 📪 3. Pydantic 模型定義 (與網頁端 payload 完美契合)
# =====================================================================
class UserPayload(BaseModel):
    uid: str
    displayName: Optional[str] = "未知受測者"
    email: Optional[str] = None
    age: Optional[int] = 0
    gender: Optional[str] = "unknown"
    height: Optional[float] = 0.0
    weight: Optional[float] = 0.0
    createdAt: Optional[int] = None

class RecordPayload(BaseModel):
    id: Optional[str] = None
    timestamp: int
    mode: str
    score: Optional[int] = 0
    details: Optional[Dict[str, Any]] = {}
    user: Optional[UserPayload] = None

class SyncPayload(BaseModel):
    syncTimestamp: int
    recordsCount: int
    usersCount: int
    users: List[UserPayload]
    records: List[RecordPayload]

# =====================================================================
# 🚀 4. API 實作路由
# =====================================================================

# 測試用首頁
@app.get("/")
def read_root():
    return {
        "status": "online",
        "target_db": "PostgreSQL (nutrigenius)",
        "message": "診間自動對接橋樑運行中！請將 Vivifrail 網頁上方的『同步接口 URL』設定為本機 address 即可使用。"
    }

# 同時支援 GET 與 POST 到同一個路徑（滿足前端 AccessibilityBar.tsx 呼叫機制）
@app.get("/api/sppb_sync")
def handle_get_users(action: Optional[str] = None):
    """
    對應 `handleRemoteSyncDown` - 從 SQL 拉取名錄回瀏覽器快取中
    """
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # 撈取目前已經存入 SQL 的所有長輩名單
        cur.execute("SELECT uid, display_name as \"displayName\", email, age, gender, height, weight, created_at as \"createdAt\" FROM sppb_users ORDER BY created_at DESC;")
        rows = cur.fetchall()
        
        # 輸出成前端可以直接 import 的 JSON 結構
        return {"users": rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"同步拉取失敗: {str(e)}")
    finally:
        cur.close()
        conn.close()

@app.post("/api/sppb_sync")
def handle_post_sync(payload: SyncPayload):
    """
    對應 `handleRemoteUpload` - 將網頁中的資料批次同步上傳至本機 SQL 資料庫中
    一鍵完成，免手動貼上!
    """
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # A. 寫入與更新長輩名冊
        for u in payload.users:
            safe_email = u.email if u.email else f"{u.uid}@vivifrail.local"
            # 依規則：sppb_users.created_at 為毫秒整數 (BIGINT)，不寫入 datetime
            user_created_at = int(u.createdAt if u.createdAt is not None else int(datetime.utcnow().timestamp() * 1000))
            
            # 使用 PostgreSQL ON CONFLICT 做 UPSERT (存在就更新, 不存在就插入)
            cur.execute("""
                INSERT INTO sppb_users (uid, display_name, email, age, gender, height, weight, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (uid) DO UPDATE SET 
                    display_name = EXCLUDED.display_name,
                    age = EXCLUDED.age,
                    height = EXCLUDED.height,
                    weight = EXCLUDED.weight;
            """, (u.uid, u.displayName, safe_email, u.age, u.gender, u.height, u.weight, user_created_at))

        # B. 寫入歷史檢測紀錄 (過濾重複上傳，防止 records 重複疊加)
        inserted_records = 0
        for r in payload.records:
            if not r.user or not r.user.uid:
                continue
            
            # 只有 record_date 是 TIMESTAMP，因此 record_date 才使用 datetime
            record_dt = datetime.fromtimestamp(r.timestamp / 1000.0)
            record_created_at = int(r.timestamp)
            
            # 轉換詳細欄位值
            det = r.details or {}
            balance_score = det.get("balanceScore", r.score if r.mode == "balance" else 0)
            walk_score = det.get("walkScore", r.score if r.mode in ["walk", "test"] else 0)
            chair_score = det.get("chairScore", r.score if r.mode == "chair" else 0)
            
            # 確保分項分數符合 0~4 分限制
            balance_score = max(0, min(4, int(balance_score))) if isinstance(balance_score, (int, float)) else 0
            walk_score = max(0, min(4, int(walk_score))) if isinstance(walk_score, (int, float)) else 0
            chair_score = max(0, min(4, int(chair_score))) if isinstance(chair_score, (int, float)) else 0

            raw_walk_time = float(det.get("rawWalkTime") or det.get("rawWalk6mTime") or 0.0)
            raw_chair_time = float(det.get("rawChairTime") or 0.0)
            raw_balance_side_by_side = float(det.get("rawBalanceSideBySide") or 0.0)
            raw_balance_semi_tandem = float(det.get("rawBalanceSemiTandem") or 0.0)
            raw_balance_tandem = float(det.get("rawBalanceTandem") or 0.0)
            additional_details_str = json.dumps(det, ensure_ascii=False)

            # 根據 record_date (或 created_at) 和 user_uid 檢查此筆紀錄是否已存在，避免重複上傳
            cur.execute("""
                SELECT id FROM sppb_records 
                WHERE user_uid = %s AND record_date = %s LIMIT 1;
            """, (r.user.uid, record_dt))
            existing = cur.fetchone()
            
            if not existing:
                cur.execute("""
                    INSERT INTO sppb_records (
                        user_uid, record_type, record_date, total_score, 
                        balance_score, walk_score, chair_score, 
                        raw_walk_time, raw_chair_time, 
                        raw_balance_side_by_side, raw_balance_semi_tandem, raw_balance_tandem, 
                        additional_details, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                """, (
                    r.user.uid, r.mode, record_dt, r.score, 
                    balance_score, walk_score, chair_score,
                    raw_walk_time, raw_chair_time,
                    raw_balance_side_by_side, raw_balance_semi_tandem, raw_balance_tandem,
                    additional_details_str, record_created_at
                ))
                inserted_records += 1

        conn.commit()
        return {
            "status": "success",
            "message": f"本機 SQL 同步寫入完畢！共更新受測長輩名冊 {len(payload.users)} 筆，並新增 {inserted_records} 筆不重複的 SPPB/運動歷史健康紀錄。"
        }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"寫入本地 SQL 異常: {str(e)}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    print("🍀 Starting local sync bridge...")
    # 執行於本機 port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
