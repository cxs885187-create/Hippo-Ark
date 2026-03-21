import jieba
import re

def calculate_nlp_metrics(text: str):
    """
    计算输入文本的 MLU (平均语句长度) 和 TTR (词汇丰富度)
    """
    if not text or len(text.strip()) == 0:
        return {"mlu": 0, "ttr": 0.0, "total_words": 0, "unique_words": 0}

    # 1. 预处理：清洗掉标点符号，只保留纯汉字和字母
    clean_text = re.sub(r'[^\w\s]', '', text)
    
    # 2. MLU 计算：这里以单次交互的有效字数为极简版 MLU
    mlu = len(clean_text)
    
    # 3. TTR 计算：使用 jieba 进行中文分词
    words = list(jieba.cut(clean_text))
    words = [w for w in words if w.strip()] # 去除空字符
    
    total_words = len(words) # N: 总词汇数
    unique_words = len(set(words)) # V: 不重复词汇数
    
    # 防止除以零
    ttr = (unique_words / total_words) if total_words > 0 else 0.0
    
    return {
        "mlu": mlu,
        "ttr": round(ttr, 2), # 保留两位小数
        "total_words": total_words,
        "unique_words": unique_words
    }

# 简单测试用例
if __name__ == "__main__":
    sample = "海马体方舟是一个很好的系统，我很喜欢这个系统。"
    print(calculate_nlp_metrics(sample))