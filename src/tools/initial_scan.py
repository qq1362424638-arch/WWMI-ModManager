"""
初始扫描：从所有ini文件中提取英文key并记录到词典
"""
import os, sys, re, json, time
sys.stdout.reconfigure(encoding='utf-8')

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
MODS_ROOT = r"D:\0Temp\mingchao\WWMI\Mods"
DICT_FILE = os.path.join(TOOLS_DIR, "en_cn_dict.json")

# 已知的中文词典（从local_dict.json和word_dict.json加载）
KNOWN_CN = {}

def load_known_cn():
    """加载已知的中文翻译"""
    global KNOWN_CN
    
    # 从local_dict.json
    try:
        with open(os.path.join(TOOLS_DIR, "local_dict.json"), "r", encoding="utf-8") as f:
            d = json.load(f)
            KNOWN_CN.update({k.lower(): v for k, v in d.items()})
    except:
        pass
    
    # 从word_dict.json
    try:
        with open(os.path.join(TOOLS_DIR, "word_dict.json"), "r", encoding="utf-8") as f:
            d = json.load(f)
            KNOWN_CN.update({k.lower(): v for k, v in d.items()})
    except:
        pass
    
    print(f"已加载 {len(KNOWN_CN)} 个已知翻译")


def extract_keys_from_ini(filepath: str) -> list:
    """从ini文件提取所有英文变量名"""
    keys = set()
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                # 匹配 $variable 模式
                for m in re.finditer(r'\$(\w+)', line):
                    var = m.group(1).lower()
                    # 过滤掉wwmi系统变量和纯数字
                    if var.startswith("wwmi") or var.isdigit():
                        continue
                    # 拆分下划线连接的单词
                    for part in var.split("_"):
                        if len(part) >= 3 and part.isalpha():
                            keys.add(part)
    except:
        pass
    return list(keys)


def extract_context_translation(filepath: str, word: str) -> str:
    """从ini文件上下文提取翻译"""
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        
        # 查找包含目标单词的注释行
        for line in content.split('\n'):
            if word.lower() in line.lower():
                # 提取分号后的中文
                comment_match = re.search(r';\s*([\u4e00-\u9fff]+)', line)
                if comment_match:
                    return comment_match.group(1)
    except:
        pass
    return ""


def scan_all_ini_files():
    """扫描所有ini文件，提取英文key"""
    print(f"正在扫描 {MODS_ROOT} 下的所有ini文件...")
    
    all_keys = {}  # word -> [(file_path, context_cn)]
    
    for dirpath, dirnames, filenames in os.walk(MODS_ROOT):
        for fn in filenames:
            if not fn.lower().endswith(".ini") or fn.lower().endswith(".bak"):
                continue
            fpath = os.path.join(dirpath, fn)
            rel_path = os.path.relpath(fpath, MODS_ROOT)
            
            keys = extract_keys_from_ini(fpath)
            for key in keys:
                if key not in all_keys:
                    all_keys[key] = []
                
                # 尝试从文件上下文提取翻译
                ctx_cn = extract_context_translation(fpath, key)
                all_keys[key].append((rel_path, ctx_cn))
    
    print(f"共找到 {len(all_keys)} 个英文单词")
    return all_keys


def build_initial_dict():
    """构建初始词典"""
    load_known_cn()
    all_keys = scan_all_ini_files()
    
    print("正在构建词典...")
    dict_data = {}
    
    for word, files_info in sorted(all_keys.items(), key=lambda x: x[0]):
        # 跳过已知的中文词汇（拼音等）
        if word in KNOWN_CN:
            continue
        
        # 查找翻译
        chinese = ""
        source = "empty"
        source_path = ""
        
        # 优先级1：检查已知词典
        if word in KNOWN_CN:
            chinese = KNOWN_CN[word]
            source = "known"
        else:
            # 优先级2：从文件上下文提取
            for fpath, ctx_cn in files_info[:5]:  # 只检查前5个文件
                if ctx_cn:
                    chinese = ctx_cn
                    source = "file_context"
                    source_path = fpath
                    break
        
        # 记录到词典
        dict_data[word] = {
            "chinese": chinese,
            "source": source,
            "source_path": source_path,
            "found_in_files": [f for f, _ in files_info[:10]],  # 记录出现在哪些文件中
            "created": time.strftime("%Y-%m-%d %H:%M:%S"),
            "updated": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
    
    # 按字母排序
    sorted_dict = dict(sorted(dict_data.items(), key=lambda x: x[0].lower()))
    
    # 保存
    with open(DICT_FILE, "w", encoding="utf-8") as f:
        json.dump(sorted_dict, f, ensure_ascii=False, indent=2)
    
    print(f"词典已保存到 {DICT_FILE}")
    print(f"共 {len(sorted_dict)} 个单词")
    
    # 统计
    stats = {"total": len(sorted_dict), "has_cn": 0, "no_cn": 0, "by_source": {}}
    for word, info in sorted_dict.items():
        if info.get("chinese"):
            stats["has_cn"] += 1
        else:
            stats["no_cn"] += 1
        src = info.get("source", "empty")
        stats["by_source"][src] = stats["by_source"].get(src, 0) + 1
    
    print(f"\n统计:")
    print(f"  有翻译: {stats['has_cn']}")
    print(f"  无翻译: {stats['no_cn']}")
    print(f"  按来源:")
    for src, count in sorted(stats['by_source'].items()):
        print(f"    {src}: {count}")


if __name__ == "__main__":
    build_initial_dict()
