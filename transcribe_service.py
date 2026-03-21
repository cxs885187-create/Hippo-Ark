import time
import sqlite3
import os
import re # 引入正则表达式库
from openai import OpenAI
from core.db_manager import DB_PATH, update_status
from core.security import get_api_key

# ==========================================
# 1. 配置 OpenAI 兼容客户端 (指向硅基流动国内节点)
# ==========================================
# 通过环境变量 SILICONFLOW_API_KEY 加载密钥
API_KEY = get_api_key()

client = OpenAI(
    api_key=API_KEY,
    base_url="https://api.siliconflow.cn/v1" # 关键：将请求劫持到国内高速节点
)

# 推荐使用阿里开源的 SenseVoice，对国内方言和带口音的普通话支持极佳，且速度极快
MODEL_NAME = "FunAudioLLM/SenseVoiceSmall" 

def get_pending_audios():
    """从数据库中捞出所有状态为 'pending' 且有音频路径的记录"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, audio_file_path 
        FROM interactions 
        WHERE status = 'pending' AND speaker = 'elder' AND audio_file_path IS NOT NULL
    ''')
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def desensitize_pii(text):
    """
    轻量级 PII (个人身份信息) 脱敏函数
    模拟 NER 实体识别，拦截身份证、手机号以及具体门牌号等物理隐私
    """
    original_text = text
    
    # 1. 拦截 11 位手机号 (替换为 138****5678)
    text = re.sub(r'(1[3-9]\d)\d{4}(\d{4})', r'\1****\2', text)
    
    # 2. 拦截 18 位身份证号
    text = re.sub(r'([1-9]\d{5})\d{8}(\d{4}|\d{3}[Xx])', r'\1********\2', text)
    
    # 3. 拦截具体地址/门牌号 (例如：新村港3号、第5栋、2单元)
    text = re.sub(r'([一二三四五六七八九十百千万\d]+)([号栋室单元楼村])', r'***\2', text)
    
    # 检测是否发生了拦截
    is_intercepted = original_text != text
    return text, is_intercepted

def process_audio(record_id, file_path):
    # 【第一道防线】：检查文件是否存在
    if not os.path.exists(file_path):
        update_status(record_id, new_status="error", transcript="[音频文件丢失]")
        return

    # 🌟 【第二道防线：空音频/误触拦截】检测音频文件大小
    # 如果文件小于 5KB (通常是没有实际声音的无效文件)，直接拦截，不发给 API
    file_size_kb = os.path.getsize(file_path) / 1024
    if file_size_kb < 5.0:
        print(f"⚠️ 拦截无效/误触音频: {file_path} (大小仅 {file_size_kb:.1f} KB)")
        update_status(record_id, new_status="error", transcript="[录音时间过短/无效]")
        return

    print(f"⏳ 正在呼叫云端大模型转录音频 (大小: {file_size_kb:.1f} KB): {file_path} ...")
    try:
        with open(file_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model=MODEL_NAME,
                file=audio_file,
                prompt="这里是海马体方舟系统。包含关键词：海马体方舟、黎锦、疍家话、王奶奶。请输出纯净的中文文本，不要包含表情符号。"
            )
            
        raw_text = transcription.text.strip()
        
        # 基础清洗
        clean_text = re.sub(r'<\|.*?\|>', '', raw_text)
        clean_text = re.sub(r'[^\w\s，。！？、：；（）《》“”‘’]', '', clean_text)
        
        # 🌟 核心新增：数据落库前，执行物理脱敏
        safe_text, intercepted = desensitize_pii(clean_text)
        
        if intercepted:
            print(f"🛡️ [安全警告] 已触发 PII 脱敏: 原文包含隐私数据，已拦截！")
        
        print(f"✅ 转录成功: {safe_text}")
        update_status(record_id, new_status="transcribed", transcript=safe_text)
        
    except Exception as e:
        print(f"❌ 转录失败: {e}")
        update_status(record_id, new_status="error", transcript="[API 转录失败，请稍后重试]")

# ==========================================
# 2. 启动后台哨兵模式 (Daemon Loop)
# ==========================================
print("🚀 海马体方舟 (HippoArk) - 语音转录微服务已启动...")
print("👀 正在日夜监听新的语音记录...\n")

while True:
    pending_tasks = get_pending_audios()
    
    for task in pending_tasks:
        process_audio(task['id'], task['audio_file_path'])
        
    # 每隔 2 秒扫描一次数据库，不占用过高 CPU 资源
    time.sleep(2)
