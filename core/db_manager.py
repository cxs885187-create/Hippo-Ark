import sqlite3
import os

DB_PATH = "data/hippo_session.db"

def init_db():
    os.makedirs("data", exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # 🌟 核心升级：增加 elder_id 字段，实现数据物理隔离
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            elder_id TEXT DEFAULT 'P01_默认受试者', 
            speaker TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            transcript TEXT,
            audio_file_path TEXT,
            status TEXT
        )
    ''')
    conn.commit()
    conn.close()

def insert_interaction(speaker, transcript=None, audio_file_path=None, status="completed", elder_id="P01_默认受试者"):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO interactions (elder_id, speaker, transcript, audio_file_path, status)
        VALUES (?, ?, ?, ?, ?)
    ''', (elder_id, speaker, transcript, audio_file_path, status))
    conn.commit()
    conn.close()

def get_recent_interactions(limit=50, elder_id=None):
    # 🌟 就是这里！必须有 elder_id=None 这个参数，asset_extractor 才不会报错！
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    # 根据受试者 ID 隔离读取数据
    if elder_id:
        cursor.execute('SELECT * FROM interactions WHERE elder_id = ? ORDER BY id ASC LIMIT ?', (elder_id, limit))
    else:
        cursor.execute('SELECT * FROM interactions ORDER BY id ASC LIMIT ?', (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def update_status(record_id, new_status, transcript=None):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    if transcript:
        cursor.execute('UPDATE interactions SET status = ?, transcript = ? WHERE id = ?', (new_status, transcript, record_id))
    else:
        cursor.execute('UPDATE interactions SET status = ? WHERE id = ?', (new_status, record_id))
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("✅ 数据库已初始化，多受试者架构 (Multi-subject Ready) 部署完毕！")