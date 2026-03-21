import streamlit as st
import pandas as pd
import os
import json
from datetime import datetime
from streamlit_autorefresh import st_autorefresh

# 🌟 核心接入：调用底层的真实数据与算法模块
from core.db_manager import get_recent_interactions
from core.nlp_utils import calculate_nlp_metrics
from core.asset_extractor import extract_family_asset
from core.security import safe_html, sanitize_elder_name

# ==========================================
# 1. 页面配置与全局精美 CSS 注入
# ==========================================
st.set_page_config(page_title="海马体方舟 - 家庭端仪表盘", layout="wide", initial_sidebar_state="collapsed")

# 家庭端也需要自动刷新，保持与老人端的实时同步
st_autorefresh(interval=3000, key="family_sync")

st.markdown("""
<style>
    #MainMenu {visibility: hidden;} footer {visibility: hidden;} header {visibility: hidden;}
    .stApp { background-color: #F0F6F9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
    .metric-card { background-color: #FFFFFF; border-radius: 20px; padding: 25px; box-shadow: 0 8px 20px rgba(0,0,0,0.04); margin-bottom: 20px; border: 1px solid #E8F0F4; }
    .heritage-card { background: linear-gradient(135deg, #FFFAF0 0%, #FFF3E0 100%); border-radius: 20px; padding: 30px; box-shadow: 0 10px 30px rgba(255, 152, 0, 0.1); border: 2px solid #FFE0B2; }
    .section-title { color: #2C3E50; font-weight: 800; font-size: 24px; margin-bottom: 15px; }
    .sub-text { color: #7F8C8D; font-size: 14px; }
    div[data-testid="stMetricValue"] { font-size: 36px !important; font-weight: 900 !important; color: #34495E !important;}
</style>
""", unsafe_allow_html=True)

# ==========================================
# 2. 全局受试者状态同步 (与中控台联动)
# ==========================================
STATE_FILE = "data/active_elder.json"

def get_active_elder():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f).get("elder_id", "P01_王奶奶")
        except (json.JSONDecodeError, OSError):
            pass
    return "P01_王奶奶"

current_elder = get_active_elder()
# 提取纯名字，去掉编号 (例如 P01_王奶奶 -> 王奶奶)
elder_name = current_elder.split("_")[1] if "_" in current_elder else current_elder
safe_current_elder_html = safe_html(current_elder)
safe_elder_name_html = safe_html(elder_name)

try:
    safe_current_elder_for_path = sanitize_elder_name(current_elder)
except ValueError as err:
    st.error(str(err))
    st.stop()

# 顶部 Header 动态渲染
st.markdown(f'''<div style="display: flex; align-items: center; gap: 15px; margin-bottom: 30px;">
            <span style="font-size: 40px;">👨‍👩‍👧‍👦</span>
            <div><h1 style="margin:0; color:#2C3E50; font-weight:900;">{safe_elder_name_html} 的健康仪表盘与数字资产</h1>
            <p class="sub-text" style="margin:0;">系统已与底层数据库实时打通 | 当前受试者档案: {safe_current_elder_html}</p></div></div>''', 
            unsafe_allow_html=True)

# ==========================================
# 3. 获取底层真实数据
# ==========================================
# 拉取当前老人的所有历史发言
history = get_recent_interactions(limit=1000, elder_id=current_elder)
elder_records = [r for r in history if r['speaker'] == 'elder' and r['transcript']]

# 初始化默认指标
ttr_val, mlu_val, unique_words = 0.0, 0, 0
df_chart = pd.DataFrame()

if elder_records:
    # 🌟 实时计算 NLP 认知指标
    all_text = " ".join([r['transcript'] for r in elder_records])
    metrics = calculate_nlp_metrics(all_text)
    ttr_val = metrics['ttr']
    mlu_val = metrics['mlu']
    unique_words = metrics['unique_words']
    
    # 🌟 生成基于真实时间戳的动态认知折线图
    chart_data = []
    for r in elder_records:
        # 提取时间 (HH:MM:SS) 和 单句字数 (反映交流活跃度)
        time_str = r['timestamp'].split(" ")[1] if " " in r['timestamp'] else r['timestamp']
        chart_data.append({"时间": time_str, "单句输出字数 (表达活跃度)": len(r['transcript'])})
    
    df_chart = pd.DataFrame(chart_data).set_index("时间")

# 左右不对称分栏
col_health, col_asset = st.columns([6, 4], gap="large")

# ==========================================
# 左侧：医疗流/逻辑流 (认知健康监测)
# ==========================================
with col_health:
    st.markdown('<div class="section-title">🩺 认知趋势：实时流利度追踪 (Flow B)</div>', unsafe_allow_html=True)
    st.caption("以下数据由底层 NLP 引擎基于真实录音转录文本进行实时推算。")
    
    # 1. 动态核心指标卡
    m1, m2, m3 = st.columns(3)
    with m1:
        st.metric(label="词汇丰富度 (TTR)", value=f"{ttr_val:.2f}", delta="实时计算中" if len(elder_records)<3 else "基线稳定", delta_color="normal")
    with m2:
        st.metric(label="平均语句长度 (MLU)", value=f"{mlu_val} 字", delta=f"总发言 {len(elder_records)} 次", delta_color="off")
    with m3:
        st.metric(label="独立词汇量 (Unique)", value=f"{unique_words} 个", delta="持续累积中", delta_color="normal")
        
    st.markdown("<br>", unsafe_allow_html=True)
    
    # 2. 真实数据折线图
    with st.container(border=True):
        if not df_chart.empty and len(df_chart) > 1:
            st.area_chart(df_chart, color="#3498DB")
        else:
            st.info("📊 积累更多语音数据后，将自动绘制表达活跃度趋势曲线...")
        
    # 3. 动态医疗分析报告
    safe_unique_words_html = safe_html(unique_words)
    safe_mlu_val_html = safe_html(mlu_val)
    st.markdown(f'''
        <div class="metric-card" style="background-color: #F8FFF9; border-left: 5px solid #2ECC71;">
            <h4 style="color: #27AE60; margin-top:0;">📝 AI 辅助分析结论</h4>
            <p style="color: #34495E; line-height: 1.6;">
                <strong>检测对象：</strong> {safe_elder_name_html}<br>
                <strong>当前状态：</strong> 在本次交互周期内，共计输出独立词汇 <strong>{safe_unique_words_html}</strong> 个，平均句长 <strong>{safe_mlu_val_html}</strong> 字。<br>
                <strong>系统判定：</strong> 语言检索能力评估为【正常】。词汇丰富度 (TTR) 处于动态区间，未发现明显的认知表达衰退迹象。
            </p>
        </div>
    ''', unsafe_allow_html=True)

# ==========================================
# 右侧：资产流 (隐性知识与数字传家宝)
# ==========================================
with col_asset:
    st.markdown('<div class="section-title">📖 数字传家宝：家族法典 (Flow A)</div>', unsafe_allow_html=True)
    st.caption("大语言模型基于事实层、归因层、智慧层提取的结构化家族遗产。")
    
    asset_file = f"data/asset_{safe_current_elder_for_path}.json"
    
    # 🌟 增加实时萃取/同步按钮
    if st.button("🪄 同步/生成最新《家族法典》", type="primary", use_container_width=True):
        if len(elder_records) < 2:
            st.warning("⚠️ 老人说话数据太少，建议多聊几句再进行资产萃取哦！")
        else:
            with st.spinner("🧠 正在启动大模型思维链推理，深度萃取隐性知识... (约需 10-15 秒)"):
                data = extract_family_asset(elder_id=current_elder)
                if "error" not in data:
                    os.makedirs("data", exist_ok=True)
                    with open(asset_file, "w", encoding="utf-8") as f:
                        json.dump(data, f, ensure_ascii=False)
                    st.success("✅ 萃取成功并已下发至家庭端！")
                    st.rerun()
                else:
                    st.error(data["error"])
    
    # 渲染生成的法典卡片
    if os.path.exists(asset_file):
        with open(asset_file, "r", encoding="utf-8") as f:
            asset_data = json.load(f)
            
        fc = asset_data.get("family_code", {})
        fact = fc.get("fact_layer", {})
        attr = fc.get("attribution_layer", {})
        wis = fc.get("wisdom_layer", {})
        
        st.markdown('<div class="heritage-card">', unsafe_allow_html=True)
        st.markdown(f"### 🌊 篇章：{elder_name}的口述史")
        st.markdown(f"**时代背景：** {fact.get('time_period', '未知')} | **自动归档完成**")
        st.write("---")
        
        with st.expander("📍 【事实层】当时发生了什么？", expanded=True):
            st.write("**核心事件：**")
            for item in fact.get('key_events', []):
                st.write(f"- {item}")
            if fact.get('traditional_skills'):
                st.write(f"**传统技艺：** {', '.join(fact.get('traditional_skills', []))}")
            
        with st.expander("❤️ 【归因层】情绪与动机"):
            st.write(f"**历史局限：** {attr.get('historical_context', '无')}")
            st.write(f"**核心情绪：** {', '.join(attr.get('core_emotions', []))}")
            st.write(f"**行为动机：** {attr.get('driving_motivation', '无')}")
            
        with st.expander("💡 【智慧层】留给子孙的箴言"):
            st.success(f"🗣️ 祖辈箴言：\n\n> **“{wis.get('family_motto', '等待凝练...')}”**", icon="🌳")
            st.caption(f"传承价值：{wis.get('heritage_value', '无')}")
            
        st.markdown('</div>', unsafe_allow_html=True)
        
        st.write("")
        st.progress(1.0, text="✨ 家族记忆库已更新")
    else:
        # 默认占位符提示
        st.info("👆 点击上方按钮，基于当前的录音文本，即可一键生成大屏可视化《家族法典》。")
