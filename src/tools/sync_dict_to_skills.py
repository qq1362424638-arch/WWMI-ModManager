"""
同步词典到skills目录
"""
import os, sys, json, shutil
sys.stdout.reconfigure(encoding='utf-8')

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
DICT_FILE = os.path.join(TOOLS_DIR, "en_cn_dict.json")

# Skills目录列表
SKILLS_DIRS = [
    r"C:\Users\qq136\.config\opencode\skills\wwmi-translate",
    r"C:\Users\qq136\.codex\skills\wwmi-translate",
]


def load_dict():
    """加载词典"""
    try:
        with open(DICT_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {}


def generate_local_dict(d: dict) -> dict:
    """生成local_dict格式（word -> chinese）"""
    local_dict = {}
    for word, info in d.items():
        chinese = info.get("chinese", "")
        if chinese:
            local_dict[word] = chinese
    return dict(sorted(local_dict.items(), key=lambda x: x[0].lower()))


def sync_to_skills():
    """同步词典到skills目录"""
    d = load_dict()
    local_dict = generate_local_dict(d)
    
    print(f"词典中共 {len(d)} 个单词，其中 {len(local_dict)} 个有翻译")
    
    for skills_dir in SKILLS_DIRS:
        if not os.path.exists(skills_dir):
            print(f"跳过不存在的目录: {skills_dir}")
            continue
        
        output_file = os.path.join(skills_dir, "local_dict.json")
        
        # 备份原文件
        if os.path.exists(output_file):
            backup_file = output_file + ".bak"
            shutil.copy2(output_file, backup_file)
            print(f"已备份: {output_file} -> {backup_file}")
        
        # 写入新文件
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(local_dict, f, ensure_ascii=False, indent=2)
        
        print(f"已同步到: {output_file}")
        print(f"  共 {len(local_dict)} 个翻译")


if __name__ == "__main__":
    sync_to_skills()
