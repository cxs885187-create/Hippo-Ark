import json
from openai import OpenAI
from core.db_manager import get_recent_interactions
from core.security import get_api_key

# ==========================================
# 1. 配置大模型客户端
# ==========================================
API_KEY = get_api_key()

client = OpenAI(
    api_key=API_KEY,
    base_url="https://api.siliconflow.cn/v1"
)

# 资产萃取属于高难度逻辑推理，建议使用推理能力更强的文本大模型
MODEL_NAME = "deepseek-ai/DeepSeek-V3" 

# ==========================================
# 2. 核心学术资产：深度强化的三级思维链 (CoT) 提示词
# ==========================================
COT_PROMPT = """
# Role
你是一位世界顶级的数字人文研究员、口述历史专家与人类学家。
你的核心任务是：从长者（特别是海南陵水疍家/黎族老人）碎片化、方言化的自然口述文本中，萃取出具有跨代际传承价值的“隐性知识”，并将其结构化为《家族法典》。

# Workflow (思维链推理机制)
请你严格按照以下“三级深度萃取”路径对提供的口述文本进行推理：
1. 【事实层 (Fact Layer)】：剥离情绪与废话，客观还原发生了什么（5W1H：时间、地点、人物、起因、经过、结果或传统技艺的具体步骤）。
2. 【归因层 (Attribution Layer)】：穿透表象，分析当时的历史时代背景、生存环境限制，以及讲述者在事件中展现出的真实情绪波动与核心动机。
3. 【智慧层 (Wisdom Layer)】：这是最终的升维。提炼出这段经历背后蕴含的、足以作为“传家宝”指导后代子孙的人生哲理、工匠精神或家族坚韧的价值观。

# Few-Shot Examples (少样本学习参考)
<example_input>
"那时候打渔苦啊，六十年代哪有天气预报，出海前全看云彩。有次遇到黑云压顶的白头浪，船差点翻了，我死死抱着舵，心里想着一家老小还在岸上等吃饭，咬着牙挺过来了。"
</example_input>
<example_output>
{
    "family_code": {
        "fact_layer": {
            "time_period": "20世纪60年代",
            "key_events": ["缺乏现代气象预报出海", "遭遇极端恶劣天气（白头浪）", "死守船舵度过危机"],
            "traditional_skills": ["通过观察云彩预测天气"]
        },
        "attribution_layer": {
            "historical_context": "科技不发达，渔民生存环境极其恶劣且充满不确定性。",
            "core_emotions": ["恐惧", "极度的责任感", "求生欲"],
            "driving_motivation": "对家庭的责任感支撑了生死关头的意志力。"
        },
        "wisdom_layer": {
            "family_motto": "风浪再大，掌舵的手不能松；心里装着家，就没有过不去的白头浪。",
            "heritage_value": "传递了在绝境中坚守责任、不屈不挠的家族生命韧性。"
        }
    }
}
</example_output>

# Constraints (严格约束条件)
1. **防幻觉原则**：如果长者的口述极度简短（例如只有一句“今天吃了饭”），无法提炼出深层智慧，请在各个字段中如实填写“信息不足，需进一步追问”，绝不能凭空捏造。
2. **语气对齐**：在 `wisdom_layer` 的 `family_motto` 字段中，必须采用“长者对晚辈教诲”的第一人称口吻。
3. **格式强制**：必须且只能输出纯粹的 JSON 对象。不要包含 ```json 标签，不要包含任何前置或后置的问候语、解释性文本。直接以 { 开始，以 } 结束。
"""

# 🌟 核心修改：接收 elder_id 参数
def extract_family_asset(elder_id="P01_王奶奶"):
    """将近期老人所有的转录文本拼接，送入大模型进行资产萃取"""
    
    # 🌟 核心修改：强制按受试者隔离拉取数据！
    history = get_recent_interactions(limit=50, elder_id=elder_id)
    elder_transcripts = [
        f"老人说: {r['transcript']}" 
        for r in history 
        if r['speaker'] == 'elder' and r['transcript']
    ]
    
    if not elder_transcripts:
        return {"error": f"暂无 {elder_id} 的语音文本，无法生成资产。"}
        
    combined_text = "\n".join(elder_transcripts)
    print(f"⏳ 正在为 {elder_id} 分析文本，启动 CoT 推理...\n文本内容：{combined_text[:50]}...")
    
    try:
        # 2. 调用大语言模型进行推理
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": COT_PROMPT},
                {"role": "user", "content": f"请对以下长者的口述内容进行三级思维链萃取：\n\n{combined_text}"}
            ],
            temperature=0.3, # 保持较低的温度，确保 JSON 输出格式稳定
        )
        
        raw_output = response.choices[0].message.content.strip()
        
        # 3. 后处理：清洗可能残留的 Markdown 标记并解析 JSON
        if raw_output.startswith("```json"):
            raw_output = raw_output[7:]
        if raw_output.endswith("```"):
            raw_output = raw_output[:-3]
            
        return json.loads(raw_output.strip())
        
    except json.JSONDecodeError as e:
        print(f"❌ JSON 解析失败，大模型幻觉输出：{raw_output}")
        return {"error": "大模型未严格遵循 JSON 格式输出，请重试。"}
    except Exception as e:
        print(f"❌ API 调用失败：{e}")
        return {"error": "资产萃取服务暂时不可用，请稍后重试。"}
