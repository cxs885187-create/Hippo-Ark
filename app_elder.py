import streamlit as st
import streamlit.components.v1 as components
import os
import json
from datetime import datetime
from streamlit_autorefresh import st_autorefresh
from core.db_manager import insert_interaction, get_recent_interactions
from core.security import safe_html, sanitize_elder_name

# ⚠️ Streamlit 的页面配置必须放在最开头！
st.set_page_config(page_title="海马体方舟 - 长者端", layout="wide")

# ==========================================
# 🌟 核心新增：全局受试者状态读取 (Session Listener)
# ==========================================
STATE_FILE = "data/active_elder.json"

def get_active_elder():
    """实时读取中控台设定的当前受试者"""
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f).get("elder_id", "P01_王奶奶")
    return "P01_王奶奶"

current_elder = get_active_elder()
safe_current_elder_html = safe_html(current_elder)

try:
    safe_current_elder_for_path = sanitize_elder_name(current_elder)
except ValueError as err:
    st.error(str(err))
    st.stop()

# ==========================================
# 1. 页面全局配置与 UI 劫持 (CSS 注入)
# ==========================================
st.markdown("""
<style>
    #MainMenu {visibility: hidden;} footer {visibility: hidden;} header {visibility: hidden;}
    .stApp { background-color: #FEF4E8; }
    
    /* 强行把按钮组压到底部 */
    .bottom-bar {
        position: fixed;
        bottom: 30px;
        width: 65%;
        z-index: 999;
    }

    div[data-testid="column"]:nth-child(1) div[data-testid="stButton"] button {
        background-color: #D6F1E8 !important; border: none !important; color: #2C5E4A !important;
        border-radius: 40px !important; height: 80px !important; font-size: 26px !important; font-weight: 900 !important; width: 100%;
    }
    div[data-testid="stAudioInput"] {
        background-color: #FFF3E0 !important; border-radius: 40px !important; padding: 10px 20px !important; border: 4px solid #FFA726 !important;
    }
    div[data-testid="column"]:nth-child(3) div[data-testid="stButton"] button {
        background-color: #FFD9D9 !important; border: none !important; color: #B71C1C !important;
        border-radius: 40px !important; height: 80px !important; font-size: 26px !important; font-weight: 900 !important; width: 100%;
    }
</style>
""", unsafe_allow_html=True)

st_autorefresh(interval=2000, key="data_sync")

def get_latest_ai_prompt():
    """🌟 强隔离：只听取当前受试者的 AI 指令"""
    history = get_recent_interactions(limit=10, elder_id=current_elder) 
    for record in reversed(history):
        if record['speaker'] in ['ai', 'system'] and record['transcript']:
            return record['transcript']
    return "您好，今天想回忆点什么呢？"

def get_elder_total_characters():
    """🌟 强隔离：精确统计当前受试者的总字符数（用于水瓶动画）"""
    history = get_recent_interactions(limit=1000, elder_id=current_elder) 
    return sum(len(r['transcript']) for r in history if r['speaker'] == 'elder' and r['transcript'])

# ==========================================
# 2. 页面核心布局构建 (必须在这里先定义列，才能用 with)
# ==========================================
col_main, col_spacer, col_feedback = st.columns([6, 0.5, 3.5])

with col_main:
    # --- 🌟 顶部专属档案标签 (动态显示当前受试者) ---
    st.markdown(f"""
    <div style="background-color: #D6F1E8; color: #2C5E4A; padding: 8px 25px; border-radius: 30px; display: inline-block; font-size: 20px; font-weight: 900; box-shadow: 0 4px 10px rgba(0,0,0,0.05); margin-bottom: 20px; border: 2px solid #BFE6D8;">
        👤 当前专属记录档案：{safe_current_elder_html}
    </div>
    """, unsafe_allow_html=True)

    # --- 🔵 核心追问区 ---
    latest_prompt = get_latest_ai_prompt()
    
    # 🌟 TTS 适老化语音播报引擎 (Web Speech API)
    if "last_spoken" not in st.session_state:
        st.session_state.last_spoken = ""

    if latest_prompt != st.session_state.last_spoken:
        st.session_state.last_spoken = latest_prompt
        safe_text = json.dumps(latest_prompt).replace("</", "<\\/")
        tts_js = f"""
        <script>
            const msg = new SpeechSynthesisUtterance({safe_text});
            msg.lang = 'zh-CN'; 
            msg.rate = 0.85;    
            msg.pitch = 1.0;
            window.speechSynthesis.speak(msg);
        </script>
        """
        components.html(tts_js, height=0, width=0)

    # 渲染大字号气泡
    safe_latest_prompt_html = safe_html(latest_prompt)
    st.markdown(f"""
    <div style="background-color:#FFF9EF;border-radius:40px;padding:80px 50px;text-align:center;font-size:48px;font-weight:900;color:#4A3525;border:4px solid #F5E6D3;line-height:1.6;height:55vh;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 30px rgba(0,0,0,0.04);">
        💬 {safe_latest_prompt_html}
    </div>
    """, unsafe_allow_html=True)
    
    # --- 🟡 底部操作区 (带物理防抖) ---
    st.markdown('<div class="bottom-bar">', unsafe_allow_html=True)
    
    # 定义底部操作区的列
    col_btn1, col_audio, col_btn2 = st.columns([1.2, 2, 1.2], gap="large")
    
    with col_btn1:
        if st.button("🔄 换个话题"):
            # 🌟 必须绑定当前老人 ID
            insert_interaction("system", transcript="老人主动请求切换话题。", status="replied", elder_id=current_elder)
            
    with col_audio:
        audio_value = st.audio_input("录音", label_visibility="collapsed")
        if audio_value is not None:
            audio_size = len(audio_value.getvalue())
            # 防抖验证
            if "last_audio_size" not in st.session_state or st.session_state.last_audio_size != audio_size:
                st.session_state.last_audio_size = audio_size
                
                os.makedirs("data/raw_audio", exist_ok=True)
                
                # 🌟 核心修改：文件名打上受试者标签，防止日后弄混
                path = f"data/raw_audio/{safe_current_elder_for_path}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.wav"
                with open(path, "wb") as f: 
                    f.write(audio_value.getbuffer())
                    
                # 🌟 核心修改：落库时打上受试者标签
                insert_interaction("elder", audio_file_path=path, status="pending", elder_id=current_elder)
                
    with col_btn2:
        if st.button("🛑 安全停止"):
            insert_interaction("system", transcript="【熔断触发】进程已暂停。", status="halted", elder_id=current_elder)
            
    st.markdown('</div>', unsafe_allow_html=True)

with col_feedback:
    # --- 🟢 记忆收集瓶 (视觉倾斜/善意欺骗核心算法) ---
    x = get_elder_total_characters()
    x_capped = min(x, 10000) # 封顶 10000 字符
    
    # 公式：y = 4 - 3 * ((10000 - x)^2 / 100000000)
    y = 4 - 3 * ((10000 - x_capped) ** 2) / 100000000.0
    
    # 将 y (范围 1 到 4) 映射为水瓶的百分比高度 (25% 到 100%)
    fill = int((y / 4.0) * 100)
    
    jar_html = f"""
    <div style="background:#FFFFFF;border-radius:30px;padding:30px 10px;text-align:center;font-family:sans-serif;">
        <div style="background:#FFF3CD;display:inline-block;padding:12px 35px;border-radius:25px;font-weight:900;font-size:22px;color:#856404;margin-bottom:30px;">📖 我的回忆录</div>
        <div style="position:relative;width:180px;height:300px;background:#FFF9F0;border-radius:30px;border:6px solid #F0E6D2;margin:0 auto;overflow:hidden;">
            <div style="position:absolute;bottom:0;left:0;width:100%;height:{fill}%;background:linear-gradient(180deg,#FFC107 0%,#FF9800 100%);transition:height 1.5s ease-out;"></div>
            <div style="position:absolute;bottom:15%;right:10px;font-weight:bold;color:#FFF;font-size:18px;">简单</div>
            <div style="position:absolute;bottom:50%;right:10px;font-weight:bold;color:#FFF;font-size:18px;">丰富</div>
            <div style="position:absolute;top:15%;right:10px;font-weight:bold;color:#9C27B0;font-size:18px;">详细</div>
        </div>
        <h3 style="margin-top:20px;color:#333;font-weight:900;font-size:24px;">细节越来越丰富了！</h3>
        <p style="color:#A0A0A0; font-size:14px; margin-top:5px; font-weight:bold;">已沉淀: {x} / 10000 字符</p>
    </div>
    """
    components.html(jar_html, height=600)
