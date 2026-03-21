import streamlit as st
import os
import time
import re
import json 
import sqlite3 
from openai import OpenAI
from streamlit_autorefresh import st_autorefresh
from core.db_manager import DB_PATH, get_recent_interactions, insert_interaction, update_status
from core.nlp_utils import calculate_nlp_metrics 
from core.security import get_api_key, sanitize_elder_name

# ==========================================
# 0. 配置大模型 API 
# ==========================================
API_KEY = get_api_key()
client = OpenAI(
    api_key=API_KEY,
    base_url="https://api.siliconflow.cn/v1"
)

# ==========================================
# 1. 页面配置与全局受试者状态锁 (Session Manager)
# ==========================================
st.set_page_config(page_title="HippoArk - 研究员中控台", layout="wide", initial_sidebar_state="expanded")
st_autorefresh(interval=2000, key="researcher_sync")

STATE_FILE = "data/active_elder.json"
LIST_FILE = "data/elder_list.json" 

# --- 状态读写工具函数 ---
def set_active_elder(elder_id):
    os.makedirs("data", exist_ok=True)
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump({"elder_id": elder_id}, f)

def get_active_elder():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f).get("elder_id", "P01_王奶奶")
        except (json.JSONDecodeError, OSError):
            pass
    return "P01_王奶奶"

def get_elder_list():
    default_list = ["P01_王奶奶", "P02_李大爷", "P03_陈阿婆", "P04_张阿公"]
    if os.path.exists(LIST_FILE):
        try:
            with open(LIST_FILE, "r", encoding="utf-8") as f:
                return json.load(f).get("elders", default_list)
        except (json.JSONDecodeError, OSError):
            pass
    return default_list

def save_elder_list(new_list):
    """覆盖保存全新的名单"""
    os.makedirs("data", exist_ok=True)
    with open(LIST_FILE, "w", encoding="utf-8") as f:
        json.dump({"elders": new_list}, f)

def add_to_elder_list(elder_id):
    current_list = get_elder_list()
    if elder_id not in current_list:
        current_list.append(elder_id)
        save_elder_list(current_list)

def rename_elder_in_db(old_name, new_name):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE interactions SET elder_id = ? WHERE elder_id = ?", (new_name, old_name))
    conn.commit()
    conn.close()

# --- 回调函数：处理下拉框零延迟切换 ---
def handle_switch_elder():
    sel = st.session_state.get("elder_dropdown")
    if sel:
        set_active_elder(sel)

# --- 初始化当前状态 ---
current_elder = get_active_elder()
elder_list = get_elder_list()

if current_elder not in elder_list:
    add_to_elder_list(current_elder)
    elder_list.append(current_elder)

# ==========================================
# 侧边栏：受试者管理面板
# ==========================================
with st.sidebar:
    st.header("👥 田野调查受试者管理")
    st.caption("切换受试者后，所有终端（老人大屏、家庭端）将瞬间同步切换语境与数据隔离。")
    
    # 1. 下拉选择器
    st.selectbox(
        "⬇️ 选择当前测试对象：", 
        options=elder_list, 
        index=elder_list.index(current_elder) if current_elder in elder_list else 0,
        key="elder_dropdown",
        on_change=handle_switch_elder
    )
    
    # 2. 新增面板 (带表单锁定防刷新)
    with st.form(key="add_elder_form", clear_on_submit=True):
        new_elder_val = st.text_input("➕ 新增被试编号：", placeholder="例如：P05_赵爷爷")
        submit_btn = st.form_submit_button("🚀 激活并追加至受试者库", use_container_width=True, type="primary")
        
        if submit_btn and new_elder_val.strip():
            try:
                clean_name = sanitize_elder_name(new_elder_val)
            except ValueError as err:
                st.error(str(err))
            else:
                add_to_elder_list(clean_name) 
                set_active_elder(clean_name)
                st.rerun() 
            
    st.success(f"🟢 当前激活态：\n**{current_elder}**")
    
    st.markdown("---")
    
    # ==========================================
    # 🌟 核心修复：编辑与删除管理面板 (使用动态 Key)
    # ==========================================
    with st.expander("⚙️ 管理受试者库 (编辑/删除)"):
        st.caption(f"以下操作将针对当前激活的: **{current_elder}**")
        
        # 🌟 修复点：给 key 加上变量后缀，强制 Streamlit 在切人时刷新输入框的内容！
        new_name = st.text_input("📝 重命名当前受试者：", value=current_elder, key=f"rename_input_{current_elder}")
        
        if st.button("💾 保存名称修改", use_container_width=True):
            if new_name.strip() and new_name != current_elder:
                try:
                    validated_new_name = sanitize_elder_name(new_name)
                except ValueError as err:
                    st.error(str(err))
                else:
                    if validated_new_name in elder_list:
                        st.error("⚠️ 该名称已存在于库中！")
                    else:
                        # 1. 更新内存列表
                        idx = elder_list.index(current_elder)
                        elder_list[idx] = validated_new_name
                        save_elder_list(elder_list)
                        # 2. 更新底层数据库历史记录（防断层）
                        rename_elder_in_db(current_elder, validated_new_name)
                        # 3. 更新激活状态
                        set_active_elder(validated_new_name)
                        st.toast(f"✅ 已成功重命名为 {validated_new_name}")
                        time.sleep(0.5)
                        st.rerun()

        # 功能 B：删除
        st.write("") # 占位
        if len(elder_list) > 1:
            if st.button("🗑️ 彻底删除当前受试者", type="primary", use_container_width=True):
                # 1. 从列表中移除
                elder_list.remove(current_elder)
                save_elder_list(elder_list)
                # 2. 将激活状态切换到列表里的第一个人（防止系统找不到当前受试者崩溃）
                fallback_elder = elder_list[0]
                set_active_elder(fallback_elder)
                st.toast(f"🗑️ 已移除 {current_elder}，自动切换至 {fallback_elder}")
                time.sleep(0.5)
                st.rerun()
        else:
            st.caption("⚠️ 库中仅剩最后 1 名受试者，无法删除。")


# ==========================================
# 主界面构建
# ==========================================
st.title("🎛️ 海马体方舟 (HippoArk) - 绿野仙踪中控台")
st.markdown("用于 ACM CHI SRC 实地田野调查的幕后干预面板")
st.markdown("---")

# ==========================================
# 2. 核心布局：左侧监控流 vs 右侧控制台
# ==========================================

col_monitor, col_controls = st.columns([6, 4], gap="large")

with col_monitor:
    st.subheader(f"📡 实时数据流 ({current_elder})")
    st.caption("这里会实时显示当前老人的录音、AI指令，以及动态生成的 NLP 认知指标。")
    
    # 强隔离：只获取当前受试者的记录
    history = get_recent_interactions(limit=20, elder_id=current_elder)
    
    for record in history:
        if record['speaker'] == 'elder':
            with st.container(border=True):
                st.markdown(f"**👵 老人输入** `[{record['timestamp']}]`")
                if record['audio_file_path'] and os.path.exists(record['audio_file_path']):
                    st.audio(record['audio_file_path'])
                
                # 状态追踪反馈
                if record['status'] == 'pending':
                    st.info("⏳ 正在等待后台 AI 引擎转录中... (请确保 transcribe_service.py 已启动)")
                elif record['status'] == 'error':
                    print(f"[TranscriptionError] record_id={record['id']} detail={record.get('transcript')}")
                    st.error("⚠️ 转录异常，请查看后台日志。")
                elif record['status'] == 'transcribed' and record['transcript']:
                    st.success(f"🗣️ AI 初步转录: {record['transcript']}")
                    
                    if "***" in record['transcript']:
                        st.markdown("""
                        <div style="background-color: #FFF0F0; border-left: 5px solid #E74C3C; padding: 10px; margin-top: 5px; margin-bottom: 15px;">
                            <span style="color: #E74C3C; font-weight: bold;">
                                🚨 [系统日志] 数据合规管线触发：基于 NER 的 PII 脱敏模块已在物理层拦截隐私数据。
                            </span>
                        </div>
                        """, unsafe_allow_html=True)
                    
                    metrics = calculate_nlp_metrics(record['transcript'])
                    
                    st.markdown("---")
                    st.caption("🧠 实时语言特征分析 (NLP Metrics)")
                    m1, m2, m3 = st.columns(3)
                    m1.metric("词汇丰富度 (TTR)", f"{metrics['ttr']}")
                    m2.metric("语句长度 (MLU)", f"{metrics['mlu']} 字")
                    m3.metric("独立词汇 (Unique)", f"{metrics['unique_words']} 个")

                    # ==========================================
                    # 预案一：WoZ 人工覆写系统
                    # ==========================================
                    with st.expander("🛠️ [WoZ 机制] 人工覆写方言转录 (修正识别错误)"):
                        st.info("💡 如果 AI 无法准确识别老人的方言，研究员可在此手动修正。")
                        
                        c_text, c_audio = st.columns([1, 1], gap="medium")
                        
                        with c_text:
                            new_text = st.text_area("✍️ 方式一：直接修改文本", value=record['transcript'], key=f"txt_{record['id']}", height=120)
                            if st.button("💾 保存文本修改", key=f"btn_txt_{record['id']}", use_container_width=True):
                                update_status(record['id'], new_status="transcribed", transcript=new_text)
                                st.toast("✅ 手动修正成功！")
                                time.sleep(0.5)
                                st.rerun()
                                
                        with c_audio:
                            st.markdown("**🎙️ 方式二：研究员普通话语音覆盖**")
                            res_audio = st.audio_input("录制普通话翻译", key=f"au_{record['id']}", label_visibility="collapsed")
                            
                            if res_audio is not None:
                                if st.button("🚀 识别我的语音并覆盖", key=f"btn_au_{record['id']}", type="primary", use_container_width=True):
                                    with st.spinner("🧠 正在识别您的普通话翻译..."):
                                        import tempfile
                                        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                                            tmp.write(res_audio.getvalue())
                                            tmp_path = tmp.name
                                        
                                        try:
                                            with open(tmp_path, "rb") as f:
                                                transcription = client.audio.transcriptions.create(
                                                    model="FunAudioLLM/SenseVoiceSmall",
                                                    file=f,
                                                    prompt="这是研究员对老人方言的普通话口述翻译，请准确转录出标准的普通话文本。"
                                                )
                                            raw_text = transcription.text.strip()
                                            clean_text = re.sub(r'<\|.*?\|>', '', raw_text)
                                            clean_text = re.sub(r'[^\w\s，。！？、：；（）《》“”‘’]', '', clean_text)
                                            
                                            update_status(record['id'], new_status="transcribed", transcript=clean_text)
                                            st.toast(f"✅ 语音覆盖成功: {clean_text}")
                                            os.remove(tmp_path) 
                                            time.sleep(0.5)
                                            st.rerun()
                                        except Exception as e:
                                            print(f"[ManualSpeechRecognitionError] record_id={record['id']} detail={e}")
                                            st.error("语音识别失败，请稍后重试。")
                    
        elif record['speaker'] in ['ai', 'system']:
            with st.container(border=True):
                color = "green" if record['speaker'] == 'ai' else "red"
                st.markdown(f"**🤖 系统下发** `[{record['timestamp']}]`")
                st.markdown(f":{color}[{record['transcript']}]")

with col_controls:
    st.subheader("🕹️ 行为干预与话术下发")
    
    # ==========================================
    # 模块 1：快速干预策略
    # ==========================================
    with st.expander("1. 快速干预策略 (一键下发)", expanded=True):
        st.markdown("依据 Kuttal (2021) 的**非评判性**与 Im (2021) 的**创伤知情**理论预设：")
        
        c1, c2, c3 = st.columns(3)
        with c1:
            if st.button("💡 晚辈求教", use_container_width=True):
                insert_interaction("ai", transcript="王奶奶，这个我还真不懂，您能多给我讲讲吗？", status="replied", elder_id=current_elder)
                st.toast("✅ 【晚辈求教】已下发老人端大屏！")
                time.sleep(0.5)
                st.rerun() 
                
        with c2:
            if st.button("🛡️ 情感安抚", use_container_width=True):
                insert_interaction("system", transcript="过去的事情咱们不提了，听得出您受苦了。咱们聊点开心的事情吧？", status="replied", elder_id=current_elder)
                st.toast("✅ 【情感安抚】已下发，切断敏感话题！")
                time.sleep(0.5)
                st.rerun()
                
        with c3:
            if st.button("🎯 肯定价值", use_container_width=True):
                insert_interaction("ai", transcript="您讲得太好了！这些细节对孩子们来说是无价的传家宝！", status="replied", elder_id=current_elder)
                st.toast("✅ 【肯定价值】已下发，配合视觉倾斜！")
                time.sleep(0.5)
                st.rerun()

    st.markdown("---")
    
    # ==========================================
    # 模块 2：预设追问库
    # ==========================================
    st.markdown("**2. 预设追问库 (Q&A 话术池)**")
    qa_library = {
        "【气象经验】以前打渔没有天气预报，您是怎么看天气的呀？": "提取隐性知识：传统自然观察经验。",
        "【海上禁忌】遇到大风浪的时候，船上有什么特别的规矩吗？": "了解民俗文化：海上禁忌与敬畏心理。",
        "【非遗技艺】黎锦的花纹那么复杂，您当年是怎么背下口诀的？": "抢救文化资产：手工艺的口头传承路径。",
        "【味觉记忆】以前过年过节，家里一定会做什么好吃的？": "情绪破冰：唤醒积极的味觉与节庆记忆。",
        "【情感历程】您和老伴当年是怎么认识的呀？": "社会变迁：记录特定时代的婚恋背景。",
        "【家族家训】小时候家里兄弟姐妹多，长辈立过什么特别的家规吗？": "精神财富：直接提取家族价值观与底线。",
        "【初次体验】第一次跟着长辈出海/干农活，您当时心里害怕吗？": "情绪归因：挖掘人生“第一次”的真实心理。",
        "【变迁见证】以前的疍家渔排和现在有什么不一样呀？": "历史见证：以第一视角记录居住与生态环境变迁。",
        "【师徒传承】村里以前谁的手艺最好？您从她那里学到了什么？": "社会网络：挖掘社区互助与技艺传授关系。",
        "【逆境生存】遇到打不到鱼、收成不好的日子，家里是怎么熬过来的？": "生命韧性：提取逆境生存智慧与坚韧品质。",
        "【自我效能】您年轻的时候，觉得最自豪的一件事是什么？": "正面干预：提升老人的自我效能感与倾诉欲。",
        "【民间偏方】以前生病了去不了大医院，村里有什么土办法吗？": "医学民俗：记录边缘地区的传统健康保健经验。",
        "【身份认同】当年离开渔船上岸生活的时候，心里是什么感觉？": "社会学研究：记录“洗脚上岸”政策下的身份转变与心理冲击。",
        "【工艺材料】织黎锦用的那些颜色，以前都是去哪里找染料的呀？": "生态知识：记录传统工艺的就地取材与自然交互。",
        "【童年记忆】小时候最期待的节日是哪一个？为什么呀？": "情绪安抚：引导话题走向安全、快乐的舒适区。",
        "【人生箴言】如果给现在的孙子孙女留一句话，您最想告诉他们什么？": "终极萃取：直接引导大模型提炼【智慧层】。",
        "【苦难共情】当年为了养家糊口，做过最辛苦的活是什么？": "深度挖掘：建立信任后，有限度地触碰艰苦记忆。",
        "【社区互助】以前村里人互相帮忙，有什么让您特别感动的事情吗？": "社会支持：提取传统乡土社会的人情纽带。",
        "【代际差异】您觉得你们这一代人，和现在的年轻人最大的不同是什么？": "价值观碰撞：引导跨代际视角的自我审视。",
        "【非遗现状】这门手艺现在学的人少了，您心里觉得遗憾吗？": "现状反思：探讨文化断层的现状与个人心境。"
    }
    
    selected_qa = st.selectbox("⬇️ 从库中选择要下发的预设追问：", list(qa_library.keys()))
    st.info(f"**🧠 探寻意图 (A)：** {qa_library[selected_qa]}")
    
    if st.button("🚀 下发选中追问至大屏", type="primary", use_container_width=True):
        actual_prompt = selected_qa.split("】")[1] 
        insert_interaction("ai", transcript=actual_prompt, status="replied", elder_id=current_elder)
        st.toast("✅ 预设追问已下发！老人端屏幕已刷新。")
        time.sleep(0.5)
        st.rerun()

    st.markdown("---")
    
    # ==========================================
    # 模块 3：自定义追问 
    # ==========================================
    st.markdown("**3. 自定义追问 (应对突发语境)**")
    custom_prompt = st.text_area("输入自定义回复：", height=80, placeholder="例如：您刚才提到的三号针，是什么木头做的？", label_visibility="collapsed")
    if st.button("✍️ 发送自定义追问", use_container_width=True):
        if custom_prompt.strip():
            insert_interaction("ai", transcript=custom_prompt, status="replied", elder_id=current_elder)
            st.toast("✅ 自定义话术已下发！")
            time.sleep(0.5)
            st.rerun()
        else:
            st.warning("⚠️ 请先输入文字内容。")

    st.markdown("---")
    
    # ==========================================
    # 模块 4：资产流萃取 (Flow A)
    # ==========================================
    st.subheader("💎 资产流萃取 (Flow A)")
    st.caption("基于三级思维链 (CoT) 将非结构化文本转化为结构化数字遗产。")
    from core.asset_extractor import extract_family_asset
    
    if st.button("🪄 一键生成《家族法典》 (JSON)", type="primary", use_container_width=True):
        with st.spinner(f"🧠 正在为 {current_elder} 启动大模型思维链推理，深度萃取隐性知识..."):
            asset_data = extract_family_asset(elder_id=current_elder) 
            if "error" in asset_data:
                st.error(asset_data["error"])
            else:
                st.success("✅ 资产萃取成功！")
                st.json(asset_data)
